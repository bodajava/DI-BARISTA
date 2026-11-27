"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Star, Trash2, Undo2 } from "lucide-react";
import { Button, ErrorLine, Field, Panel, StatusLine, toCents, Toggle, toEgp } from "@/components/admin/kit";
import { useIsAdmin } from "@/components/admin/session";
import { useAdmin } from "@/lib/admin-i18n";
import { api, get } from "@/lib/admin/api";
import type { Brand, Category, Product, Variant } from "@/lib/admin/types";

const MAX_PHOTOS = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

type Photo = { key: string; url: string; file?: File; removed?: boolean };

const refId = (r: Product["categoryId"] | Product["brandId"]) => (r && typeof r === "object" ? r.id : (r as string) || "");

function VersionRow({ v, onSaved }: { v: Variant; onSaved: (p: Product) => void }) {
  const { t } = useAdmin();
  const [row, setRow] = useState({
    label: v.label,
    labelAr: v.labelAr ?? "",
    sku: v.sku ?? "",
    price: toEgp(v.regularPriceCents),
    sale: toEgp(v.salePriceCents),
    stock: v.stock === null || v.stock === undefined ? "" : String(v.stock),
    isActive: v.isActive,
  });
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const price = toCents(row.price);
      const sale = toCents(row.sale);
      if (!price || Number.isNaN(price)) throw new Error("Enter a price");
      if (sale !== null && (Number.isNaN(sale) || sale >= price)) throw new Error("The sale price must be lower than the price");
      return api<Product>(`variants/${v.id}`, {
        method: "PATCH",
        body: {
          label: row.label,
          labelAr: row.labelAr,
          sku: row.sku,
          priceCents: price,
          salePriceCents: sale,
          stock: row.stock === "" ? null : Number(row.stock),
          isActive: row.isActive,
        },
      });
    },
    onSuccess: (r) => (setErr(null), onSaved(r.data)),
    onError: (e) => setErr((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => api<Product>(`variants/${v.id}`, { method: "DELETE" }),
    onSuccess: (r) => onSaved(r.data),
    onError: (e) => setErr((e as Error).message),
  });
  const set = (k: keyof typeof row) => (e: React.ChangeEvent<HTMLInputElement>) => setRow((r) => ({ ...r, [k]: e.target.value }));
  return (
    <tr>
      <td data-label={t("Name")}><input className="adm-input" aria-label={t("Name")} value={row.label} onChange={set("label")} /></td>
      <td data-label={t("Arabic name")}><input className="adm-input" dir="rtl" aria-label={t("Arabic name")} value={row.labelAr} onChange={set("labelAr")} /></td>
      <td data-label="SKU"><input className="adm-input" aria-label="SKU" value={row.sku} onChange={set("sku")} /></td>
      <td data-label={t("Price")}><input className="adm-input w-24" inputMode="decimal" aria-label={t("Price")} value={row.price} onChange={set("price")} /></td>
      <td data-label={t("Sale")}><input className="adm-input w-24" inputMode="decimal" aria-label={t("Sale")} value={row.sale} onChange={set("sale")} /></td>
      <td data-label={t("Stock")}><input className="adm-input w-20" inputMode="numeric" aria-label={t("Stock")} placeholder={t("Shared")} value={row.stock} onChange={set("stock")} /></td>
      <td data-label={t("Active")}><Toggle label="" checked={row.isActive} onChange={(c) => setRow((r) => ({ ...r, isActive: c }))} /></td>
      <td>
        <div className="flex gap-1">
          <Button pending={save.isPending} onClick={() => save.mutate()}>{t("Save")}</Button>
          <button type="button" className="adm-icon-btn" aria-label={t("Remove")} onClick={() => window.confirm(t("Remove this version?")) && remove.mutate()}>
            <Trash2 size={14} />
          </button>
        </div>
        {err ? <small className="adm-field-error">{t(err)}</small> : null}
      </td>
    </tr>
  );
}

function Versions({ product, onChange }: { product: Product; onChange: (p: Product) => void }) {
  const { t } = useAdmin();
  const [draft, setDraft] = useState({ label: "", labelAr: "", price: "", stock: "" });
  const [err, setErr] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => {
      const price = toCents(draft.price);
      if (!draft.label.trim()) throw new Error("Give the version a name");
      if (!price || Number.isNaN(price)) throw new Error("Enter a price");
      return api<Product>(`products/${product.id}/variants`, {
        method: "POST",
        body: { label: draft.label, labelAr: draft.labelAr || undefined, priceCents: price, stock: draft.stock === "" ? null : Number(draft.stock) },
      });
    },
    onSuccess: (r) => {
      onChange(r.data);
      setDraft({ label: "", labelAr: "", price: "", stock: "" });
      setErr(null);
    },
    onError: (e) => setErr((e as Error).message),
  });
  return (
    <Panel title={t("Versions")}>
      <p className="mb-3 text-sm text-[var(--muted-foreground)]">
        {t("For sizes, finishes or packs. Leave a version's stock empty to share the product's stock.")}
      </p>
      {product.variants?.length ? (
        <div className="overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Arabic name")}</th>
                <th>SKU</th>
                <th>{t("Price")}</th>
                <th>{t("Sale")}</th>
                <th>{t("Stock")}</th>
                <th>{t("Active")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <VersionRow key={`${v.id}-${v.regularPriceCents}-${v.stock}-${v.isActive}`} v={v} onSaved={onChange} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_8rem_7rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label={t("Name")}>{(id) => <input id={id} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="250g" />}</Field>
        <Field label={t("Arabic name")}>{(id) => <input id={id} dir="rtl" value={draft.labelAr} onChange={(e) => setDraft({ ...draft, labelAr: e.target.value })} />}</Field>
        <Field label={t("Price (EGP)")}>{(id) => <input id={id} inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />}</Field>
        <Field label={t("Stock")}>{(id) => <input id={id} inputMode="numeric" placeholder={t("Shared")} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />}</Field>
        <Button type="submit" pending={add.isPending}>{t("Add version")}</Button>
      </form>
      {err ? <ErrorLine error={err} /> : null}
    </Panel>
  );
}

export function ProductForm({ product }: { product?: Product }) {
  const { t, lang } = useAdmin();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const readOnly = !isAdmin || Boolean(product?.isDeleted);

  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: () => get<Category[]>("categories/admin/all") });
  const brands = useQuery({ queryKey: ["admin", "brands"], queryFn: () => get<Brand[]>("brands/admin/all") });

  const [f, setF] = useState(() => ({
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    sku: product?.sku ?? "",
    shortDescription: product?.shortDescription ?? "",
    description: product?.description ?? "",
    categoryId: product ? refId(product.categoryId) : "",
    brandId: product ? refId(product.brandId) : "",
    nameAr: product?.nameAr ?? "",
    shortDescriptionAr: product?.shortDescriptionAr ?? "",
    descriptionAr: product?.description_ar ?? "",
    price: toEgp(product?.priceCents),
    sale: product && product.discountPercent > 0 ? toEgp(product.finalPriceCents) : "",
    cost: toEgp(product?.costCents),
    stock: product ? String(product.stock) : "0",
    lowStock: String(product?.lowStockThreshold ?? 5),
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
  }));
  const [photos, setPhotos] = useState<Photo[]>(() => (product?.imageUrls ?? []).map((url) => ({ key: url, url })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [line, setLine] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [current, setCurrent] = useState<Product | undefined>(product);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const visible = photos.filter((p) => !p.removed);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Photo[] = [];
    for (const file of Array.from(files)) {
      if (!TYPES.includes(file.type)) {
        setLine({ msg: t("{f}: use JPG, PNG, WebP or AVIF.", { f: file.name }), tone: "error" });
        continue;
      }
      if (file.size > MAX_BYTES) {
        setLine({ msg: t("{f} is over 5 MB.", { f: file.name }), tone: "error" });
        continue;
      }
      next.push({ key: `${file.name}-${file.size}-${Math.random()}`, url: URL.createObjectURL(file), file });
    }
    setPhotos((p) => {
      const room = MAX_PHOTOS - p.filter((x) => !x.removed).length;
      return [...p, ...next.slice(0, Math.max(0, room))];
    });
  };
  const movePhoto = (key: string, delta: number) =>
    setPhotos((list) => {
      const vis = list.filter((p) => !p.removed);
      const i = vis.findIndex((p) => p.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= vis.length) return list;
      [vis[i], vis[j]] = [vis[j], vis[i]];
      return [...vis, ...list.filter((p) => p.removed)];
    });

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = t("Enter a name");
    if (!f.sku.trim()) e.sku = t("Enter a SKU");
    if (!f.categoryId) e.categoryId = t("Choose a category");
    const price = toCents(f.price);
    if (!price || Number.isNaN(price) || price <= 0) e.price = t("Enter a price above 0");
    const sale = toCents(f.sale);
    if (sale !== null && (Number.isNaN(sale) || (price && sale >= price))) e.sale = t("The sale price must be lower than the price");
    const cost = toCents(f.cost);
    if (cost !== null && Number.isNaN(cost)) e.cost = t("Enter a valid amount");
    if (!/^\d+$/.test(f.stock)) e.stock = t("Enter a whole number");
    if (!/^\d+$/.test(f.lowStock)) e.lowStock = t("Enter a whole number");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set("name", f.name.trim());
      fd.set("nameAr", f.nameAr.trim());
      if (f.slug.trim()) fd.set("slug", f.slug.trim());
      fd.set("sku", f.sku.trim());
      fd.set("shortDescription", f.shortDescription);
      fd.set("shortDescriptionAr", f.shortDescriptionAr);
      fd.set("description", f.description);
      fd.set("description_ar", f.descriptionAr);
      fd.set("categoryId", f.categoryId);
      fd.set("brandId", f.brandId);
      fd.set("priceCents", String(toCents(f.price)));
      fd.set("salePriceCents", f.sale.trim() ? String(toCents(f.sale)) : "");
      fd.set("costCents", f.cost.trim() ? String(toCents(f.cost)) : "");
      fd.set("stock", f.stock);
      fd.set("lowStockThreshold", f.lowStock);
      fd.set("isActive", String(f.isActive));
      fd.set("isFeatured", String(f.isFeatured));
      fd.set("imageUrls", visible.filter((p) => !p.file).map((p) => p.url).join(","));
      for (const p of visible) if (p.file) fd.append("images", p.file);
      return product
        ? api<Product>(`products/${product.id}`, { method: "PATCH", body: fd })
        : api<Product>("products", { method: "POST", body: fd });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin", "lowstock"] });
      if (!product) {
        router.replace(`/admin/products/${r.data.id}?created=1`);
        return;
      }
      setCurrent(r.data);
      setPhotos(r.data.imageUrls.map((url) => ({ key: url, url })));
      setLine({ msg: t("Saved."), tone: "ok" });
    },
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });

  const remove = useMutation({
    mutationFn: () => api(`products/${product!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      router.replace("/admin/products");
    },
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });

  const catOptions = useMemo(() => categories.data ?? [], [categories.data]);

  return (
    <div className="grid gap-4">
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly && validate()) save.mutate();
      }}
    >
      {product?.isDeleted ? (
        <p className="adm-error">{t("This product was deleted. It's kept read-only so past orders keep their copy.")}</p>
      ) : null}
      <fieldset disabled={readOnly} className="grid gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 xl:col-span-2">
          <Panel title={t("Basics")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Name")} error={errors.name}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.name} value={f.name} onChange={set("name")} required />}</Field>
              <Field label={t("Link name")} hint={`/products/${f.slug || t("made-from-the-name")}`}>
                {(id, d) => <input id={id} aria-describedby={d} value={f.slug} onChange={set("slug")} placeholder={t("Leave empty to use the name")} />}
              </Field>
              <Field label="SKU" error={errors.sku}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.sku} value={f.sku} onChange={set("sku")} />}</Field>
              <Field label={t("Short description (one line)")}>{(id) => <input id={id} maxLength={240} value={f.shortDescription} onChange={set("shortDescription")} />}</Field>
              <Field label={t("Category")} error={errors.categoryId}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} aria-invalid={!!errors.categoryId} value={f.categoryId} onChange={set("categoryId")}>
                    <option value="">{t("Choose…")}</option>
                    {catOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parentId ? "— " : ""}
                        {(lang === "ar" && c.nameAr) || c.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={t("Brand (optional)")}>
                {(id) => (
                  <select id={id} value={f.brandId} onChange={set("brandId")}>
                    <option value="">{t("No brand")}</option>
                    {brands.data?.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <div className="mt-3">
              <Field label={t("Description")}>{(id) => <textarea id={id} maxLength={2000} value={f.description} onChange={set("description")} />}</Field>
            </div>
          </Panel>

          <Panel title={t("Arabic version")}>
            <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t("Leave empty and the English text is used there.")}</p>
            <div className="grid gap-3" dir="rtl">
              <Field label={t("Arabic name")}>{(id) => <input id={id} value={f.nameAr} onChange={set("nameAr")} />}</Field>
              <Field label={t("Arabic short description")}>{(id) => <input id={id} maxLength={240} value={f.shortDescriptionAr} onChange={set("shortDescriptionAr")} />}</Field>
              <Field label={t("Arabic description")}>{(id) => <textarea id={id} maxLength={2000} value={f.descriptionAr} onChange={set("descriptionAr")} />}</Field>
            </div>
          </Panel>

          <Panel title={t("Photos")} action={<span className="text-xs text-[var(--muted-foreground)]">{visible.length}/{MAX_PHOTOS}</span>}>
            <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t("JPG, PNG, WebP or AVIF, up to 5 MB each. The first photo is the cover.")}</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p) => {
                const index = visible.findIndex((v) => v.key === p.key);
                return (
                  <li key={p.key} className={`relative overflow-hidden rounded-2xl border border-[var(--border)] ${p.removed ? "opacity-40" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                    <div className="absolute start-2 top-2 flex gap-1">
                      {index === 0 && !p.removed ? <span className="adm-chip bg-[var(--card)]" data-tone="brand">{t("Cover")}</span> : null}
                      {p.file ? <span className="adm-chip bg-[var(--card)]">{t("New")}</span> : null}
                    </div>
                    <div className="flex flex-wrap justify-center gap-1 bg-[var(--card)] p-2">
                      {p.removed ? (
                        <button type="button" className="adm-btn !min-h-8 !px-3 !text-xs" onClick={() => setPhotos((l) => l.map((x) => (x.key === p.key ? { ...x, removed: false } : x)))}>
                          <Undo2 size={13} /> {t("Keep photo")}
                        </button>
                      ) : (
                        <>
                          <button type="button" className="adm-icon-btn !h-8 !w-8" aria-label={t("Make cover")} disabled={index === 0} onClick={() => movePhoto(p.key, -index)}>
                            <Star size={13} />
                          </button>
                          <button type="button" className="adm-icon-btn !h-8 !w-8" aria-label={t("Move earlier")} disabled={index === 0} onClick={() => movePhoto(p.key, -1)}>
                            <ArrowUp size={13} />
                          </button>
                          <button type="button" className="adm-icon-btn !h-8 !w-8" aria-label={t("Move later")} disabled={index === visible.length - 1} onClick={() => movePhoto(p.key, 1)}>
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="adm-icon-btn !h-8 !w-8"
                            aria-label={t("Remove")}
                            onClick={() => setPhotos((l) => (p.file ? l.filter((x) => x.key !== p.key) : l.map((x) => (x.key === p.key ? { ...x, removed: true } : x))))}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              {visible.length < MAX_PHOTOS ? (
                <li>
                  <button type="button" className="adm-dropzone aspect-square w-full" onClick={() => fileInput.current?.click()}>
                    <span className="grid justify-items-center gap-2">
                      <ImagePlus size={22} /> {t("Add photos")}
                    </span>
                  </button>
                  <input ref={fileInput} type="file" accept={TYPES.join(",")} multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel title={t("Price and stock")}>
            <div className="grid gap-3">
              <Field label={t("Price (EGP)")} error={errors.price}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.price} inputMode="decimal" value={f.price} onChange={set("price")} />}</Field>
              <Field label={t("Sale price (EGP)")} hint={t("Empty = no sale")} error={errors.sale}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.sale} inputMode="decimal" value={f.sale} onChange={set("sale")} />}</Field>
              <Field label={t("Cost (EGP)")} hint={t("Private. Used to work out profit.")} error={errors.cost}>{(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={f.cost} onChange={set("cost")} />}</Field>
              <Field label={t("Stock")} hint={t("For products without versions, or versions that share it")} error={errors.stock}>{(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={f.stock} onChange={set("stock")} />}</Field>
              <Field label={t("Low-stock alert at")} error={errors.lowStock}>{(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={f.lowStock} onChange={set("lowStock")} />}</Field>
            </div>
          </Panel>
          <Panel title={t("Visibility")}>
            <div className="grid gap-3">
              <Toggle label={t("Show in the store")} checked={f.isActive} onChange={(c) => setF((s) => ({ ...s, isActive: c }))} />
              <Toggle label={t("Show on the home page (best sellers)")} checked={f.isFeatured} onChange={(c) => setF((s) => ({ ...s, isFeatured: c }))} />
            </div>
          </Panel>
          {!readOnly ? (
            <Panel>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" pending={save.isPending}>
                  {product ? (save.isPending ? t("Saving…") : t("Save")) : t("Create")}
                </Button>
                {product ? (
                  <Link className="adm-btn" href={`/${lang}/products/${current?.slug ?? product.slug}`} target="_blank" rel="noopener">
                    <ExternalLink size={14} /> {t("View in store")}
                  </Link>
                ) : null}
                {product ? (
                  <Button
                    variant="danger"
                    pending={remove.isPending}
                    onClick={() => window.confirm(t("Delete this product? It disappears from the store; orders that include it keep their copy.")) && remove.mutate()}
                  >
                    <Trash2 size={14} /> {t("Delete")}
                  </Button>
                ) : null}
              </div>
              <StatusLine message={line?.msg} tone={line?.tone} />
            </Panel>
          ) : null}
        </div>
      </fieldset>
    </form>
      {current && !readOnly ? <Versions product={current} onChange={(p) => (setCurrent(p), qc.invalidateQueries({ queryKey: ["admin", "products"] }))} /> : null}
    </div>
  );
}
