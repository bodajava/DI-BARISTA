/**
 * Make the store match the price list exactly (scripts/price-list.json from price-list-to-json.py).
 * Nothing is invented: names, sizes, prices, category, origin, process, roasting, notes,
 * altitude and description all come from the sheet; every other product field is cleared.
 *
 *   - sheet product with sellable sizes → shown, with exactly those sizes and prices
 *   - sheet product with no sellable size (no price / Non Active) → hidden, sizes removed
 *   - product or category not in the sheet → removed from the store (soft delete; past orders
 *     keep their copy)
 *
 *   DATABASE_URL=… node scripts/sync-price-list.mjs [--apply]
 * Without --apply it only prints what would change.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const { products: sheet } = JSON.parse(readFileSync(new URL('./price-list.json', import.meta.url), 'utf8'));
const egp = (c) => `${(c / 100).toLocaleString('en-US')} EGP`;
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
const log = [];

async function categoryId(name) {
  const existing = await prisma.category.findFirst({
    where: { deletedAt: null, name: { equals: name, mode: 'insensitive' } },
  });
  // Only the sheet's own word: no Arabic name, description or parent that the sheet doesn't have
  const data = { name, nameAr: null, description: null, descriptionAr: null, parentId: null, isActive: true };
  if (existing) {
    if (apply) await prisma.category.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  log.push(`CREATE  category "${name}"`);
  if (!apply) return `new:${name}`;
  const created = await prisma.category.create({ data: { ...data, slug: slugify(name) } });
  return created.id;
}

async function uniqueSlug(base, productId) {
  let slug = slugify(base) || 'product';
  const taken = await prisma.product.findFirst({ where: { slug, NOT: { id: productId ?? '' } }, select: { id: true } });
  if (taken) slug = `${slug}-${Date.now().toString(36)}`;
  return slug;
}

async function main() {
  const keepCategories = new Set();
  const sheetSkus = sheet.map((p) => p.siteSku).filter(Boolean);
  const keepSkus = new Set();

  // First take away everything that isn't in the sheet (and its sizes, so their item numbers
  // are free for the sheet's own products)
  const others = await prisma.product.findMany({ where: { sku: { notIn: sheetSkus } }, include: { variants: true } });
  for (const p of others) {
    if (!p.deletedAt) log.push(`REMOVE  ${p.sku} "${p.name}" (not in the sheet)`);
    if (apply) {
      await prisma.productVariant.deleteMany({ where: { productId: p.id } });
      if (!p.deletedAt) await prisma.product.update({ where: { id: p.id }, data: { deletedAt: new Date(), isActive: false, isFeatured: false } });
    }
  }

  for (const item of sheet) {
    const sku = item.siteSku;
    if (!sku) {
      log.push(`SKIP    "${item.name}" (no site product mapped)`);
      continue;
    }
    const product = await prisma.product.findUnique({ where: { sku }, include: { variants: true } });
    const sellable = item.sizes;
    if (!product && !sellable.length) {
      log.push(`SKIP    "${item.name}" (not on the site and nothing sellable in the sheet)`);
      continue;
    }

    const catId = await categoryId(item.category);
    keepCategories.add(item.category.toLowerCase());
    keepSkus.add(sku);

    const fromSheet = {
      name: item.name,
      nameAr: null,
      shortDescription: null,
      shortDescriptionAr: null,
      description: item.description || null,
      descriptionAr: null,
      categoryId: catId,
      extraCategoryIds: [],
      brandId: null,
      roastLevel: item.roastLevel,
      availableGrinds: [],
      flavorNotes: item.flavorNotes,
      flavorNotesAr: [],
      originCountry: item.originCountry || null,
      originCountryAr: null,
      elevation: item.elevation || null,
      elevationAr: null,
      processingMethod: item.processingMethod || null,
      processingMethodAr: null,
      weightGrams: 0,
      costCents: null,
      isFeatured: false,
    };

    let pricing = {};
    if (sellable.length) {
      const prices = sellable.map((v) => v.priceCents);
      pricing = {
        priceCents: Math.min(...prices),
        finalPriceCents: Math.min(...prices),
        maxPriceCents: Math.max(...prices),
        discountPercent: 0,
        isActive: true,
        deletedAt: null,
      };
    } else {
      pricing = { isActive: false, maxPriceCents: null };
    }

    const before = product?.variants.map((v) => `${v.label}=${egp(v.priceCents)}`).join(', ') || '-';
    const after = sellable.map((v) => `${v.label}=${egp(v.priceCents)}`).join(', ') || '(hidden: ' + item.unsellable.map((u) => `${u.label} ${u.why}`).join(', ') + ')';
    log.push(`${product ? 'UPDATE ' : 'CREATE '} ${sku} "${item.name}" [${item.category}]\n          was: ${product ? `${product.name} | ${before}` : '-'}\n          now: ${after}`);

    if (!apply) continue;
    const slug = await uniqueSlug(item.name, product?.id);
    const saved = product
      ? await prisma.product.update({ where: { id: product.id }, data: { ...fromSheet, ...pricing, slug } })
      : await prisma.product.create({
          data: { ...fromSheet, ...pricing, sku, slug, stock: 0, priceCents: pricing.priceCents, finalPriceCents: pricing.finalPriceCents },
        });
    await prisma.$transaction([
      prisma.productVariant.deleteMany({ where: { productId: saved.id } }),
      prisma.productVariant.createMany({
        data: sellable.map((v, i) => ({
          productId: saved.id,
          label: v.label,
          labelAr: null,
          sku: v.sku,
          priceCents: v.priceCents,
          weightGrams: v.weightGrams,
          capsulesCount: v.capsulesCount,
          position: i,
          isActive: true,
        })),
      }),
    ]);
  }

  const categories = await prisma.category.findMany({ where: { deletedAt: null } });
  for (const c of categories) {
    if (keepCategories.has(c.name.toLowerCase())) continue;
    log.push(`REMOVE  category "${c.name}" (not in the sheet)`);
    if (apply) {
      const stamp = Date.now().toString(36);
      await prisma.category.updateMany({ where: { parentId: c.id }, data: { parentId: null } });
      await prisma.category.update({
        where: { id: c.id },
        data: { deletedAt: new Date(), isActive: false, name: `${c.name}__deleted_${stamp}`, slug: `${c.slug}--deleted-${stamp}` },
      });
    }
  }

  console.log(log.join('\n'));
  console.log(apply ? '\nApplied.' : '\nDry run only. Add --apply to write.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
