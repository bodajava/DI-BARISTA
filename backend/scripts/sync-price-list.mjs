/**
 * Make the store match the price list exactly (scripts/price-list.json, made by
 * price-list-to-json.py):
 *   - products in the sheet with sellable sizes: sizes, prices and SKUs replaced by the sheet, shown
 *   - products in the sheet with no sellable size (no price / Non Active): hidden
 *   - products not in the sheet: removed from the store (soft delete; past orders keep their copy)
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

async function main() {
  const keepSkus = new Set();
  const log = [];

  for (const item of sheet) {
    const sellable = item.variants;
    let sku = item.siteSku;
    if (!sku && item.new) sku = item.new.sku;
    if (!sku) continue;

    let product = await prisma.product.findUnique({ where: { sku }, include: { variants: true } });

    if (!sellable.length) {
      if (product && (product.isActive || product.deletedAt)) {
        log.push(`HIDE    ${sku} ${product.name} (in the sheet but no sellable size: ${item.unsellable.map((u) => `${u.size} ${u.why}`).join(', ')})`);
        if (apply) await prisma.product.update({ where: { id: product.id }, data: { isActive: false, isFeatured: false } });
      }
      if (product) keepSkus.add(sku);
      continue;
    }

    const prices = sellable.map((v) => v.priceCents);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const priceData = {
      priceCents: min,
      discountPercent: 0,
      finalPriceCents: min,
      maxPriceCents: max,
      isActive: true,
      deletedAt: null,
      ...(sellable[0].weightGrams ? { weightGrams: sellable[0].weightGrams } : {}),
    };

    if (!product) {
      const template = await prisma.product.findUnique({ where: { sku: item.new.copyFrom } });
      if (!template) throw new Error(`Template ${item.new.copyFrom} not found for ${sku}`);
      log.push(`CREATE  ${sku} ${item.new.name} (photos and texts copied from ${item.new.copyFrom})`);
      if (apply) {
        product = await prisma.product.create({
          data: {
            sku,
            name: item.new.name,
            nameAr: item.new.nameAr,
            slug: item.new.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            shortDescription: template.shortDescription,
            shortDescriptionAr: template.shortDescriptionAr,
            description: template.description,
            descriptionAr: template.descriptionAr,
            categoryId: template.categoryId,
            brandId: template.brandId,
            roastLevel: template.roastLevel,
            availableGrinds: template.availableGrinds,
            flavorNotes: template.flavorNotes,
            flavorNotesAr: template.flavorNotesAr,
            originCountry: template.originCountry,
            originCountryAr: template.originCountryAr,
            imageUrls: template.imageUrls,
            stock: template.stock,
            ...priceData,
          },
          include: { variants: true },
        });
      }
    } else {
      const before = product.variants.map((v) => `${v.label}=${egp(v.priceCents)}`).join(', ');
      log.push(`UPDATE  ${sku} ${product.name}\n          was: ${before || '-'}\n          now: ${sellable.map((v) => `${v.label}=${egp(v.priceCents)}`).join(', ')}`);
      if (apply) await prisma.product.update({ where: { id: product.id }, data: priceData });
    }
    keepSkus.add(sku);

    if (apply && product) {
      await prisma.$transaction([
        prisma.productVariant.deleteMany({ where: { productId: product.id } }),
        prisma.productVariant.createMany({
          data: sellable.map((v, i) => ({
            productId: product.id,
            label: v.label,
            labelAr: v.labelAr,
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
  }

  const others = await prisma.product.findMany({ where: { deletedAt: null, sku: { notIn: [...keepSkus] } } });
  for (const p of others) {
    log.push(`REMOVE  ${p.sku} ${p.name} (not in the sheet)`);
    if (apply) await prisma.product.update({ where: { id: p.id }, data: { deletedAt: new Date(), isActive: false, isFeatured: false } });
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
