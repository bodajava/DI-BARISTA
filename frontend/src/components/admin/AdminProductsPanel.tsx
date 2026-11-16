"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useAdmin } from "@/lib/admin-i18n";
import {
  GrindType,
  IBrandRef,
  ICategoryRef,
  IProduct,
  RoastLevel,
} from "@/lib/types";

interface AdminProductsPanelProps {
  products: IProduct[];
  brands: IBrandRef[];
  categories: ICategoryRef[];
  searchFilter: string;
  onRefresh: () => Promise<void>;
}

const ROAST_LEVELS: RoastLevel[] = [
  "LIGHT",
  "MEDIUM",
  "MEDIUM_DARK",
  "DARK",
  "ESPRESSO_ROAST",
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** The API accepts up to 5 files per request */
const MAX_NEW_FILES = 5;

const ALL_GRINDS: GrindType[] = [
  "WHOLE_BEAN",
  "ESPRESSO",
  "FILTER_V60",
  "CHEMEX",
  "FRENCH_PRESS",
  "AEROPRESS",
  "TURKISH",
  "COLD_BREW",
];

export function AdminProductsPanel({
  products,
  brands,
  categories,
  searchFilter,
  onRefresh,
}: AdminProductsPanelProps) {
  const { t, money, num, lang } = useAdmin();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [roastLevel, setRoastLevel] = useState<RoastLevel>("MEDIUM");
  const [availableGrinds, setAvailableGrinds] = useState<GrindType[]>([
    "WHOLE_BEAN",
    "ESPRESSO",
  ]);
  const [originCountry, setOriginCountry] = useState("Ethiopia");
  const [weightGrams, setWeightGrams] = useState("250");
  const [priceEgp, setPriceEgp] = useState("420");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [stock, setStock] = useState("25");
  const [flavorNotes, setFlavorNotes] = useState("Cocoa, Bergamot");
  const [images, setImages] = useState<string[]>([]);
  /** Picked files with a local preview URL (revoked when removed or on unmount) */
  const [newFiles, setNewFiles] = useState<Array<{ file: File; url: string }>>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filesRef = useRef(newFiles);
  useEffect(() => {
    filesRef.current = newFiles;
  }, [newFiles]);
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const clearNewFiles = () => {
    setNewFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.url));
      return [];
    });
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const ok: Array<{ file: File; url: string }> = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setError(t("Only JPG, PNG, WEBP or AVIF images"));
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(t("Each image must be 5 MB or less"));
        continue;
      }
      ok.push({ file: f, url: URL.createObjectURL(f) });
    }
    setNewFiles((prev) => {
      const next = [...prev, ...ok];
      next.slice(MAX_NEW_FILES).forEach((f) => URL.revokeObjectURL(f.url));
      return next.slice(0, MAX_NEW_FILES);
    });
  };
  const [isActive, setIsActive] = useState(true);

  const extractRefId = (val: string | { _id?: string; id?: string }): string =>
    typeof val === "string" ? val : val?.id || val?._id || "";

  const openCreateModal = () => {
    setEditing(null);
    setName("");
    setNameAr("");
    setSku(`DIB-${Date.now().toString().slice(-4)}`);
    setDescription("");
    setBrandId(brands[0]?.id || brands[0]?._id || "");
    setCategoryId(categories[0]?.id || categories[0]?._id || "");
    setRoastLevel("MEDIUM");
    setAvailableGrinds(["WHOLE_BEAN", "ESPRESSO"]);
    setOriginCountry("Ethiopia");
    setWeightGrams("250");
    setPriceEgp("420");
    setDiscountPercent("0");
    setStock("25");
    setFlavorNotes("Chocolate, Jasmine");
    setImages([]);
    clearNewFiles();
    setIsActive(true);
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: IProduct) => {
    setEditing(p);
    setName(p.name);
    setNameAr(p.nameAr || "");
    setSku(p.sku);
    setDescription(p.description || "");
    setBrandId(
      extractRefId(p.brandId) || brands[0]?.id || brands[0]?._id || "",
    );
    setCategoryId(
      extractRefId(p.categoryId) ||
        categories[0]?.id ||
        categories[0]?._id ||
        "",
    );
    setRoastLevel(p.roastLevel || "MEDIUM");
    setAvailableGrinds(
      p.availableGrinds?.length ? p.availableGrinds : ["WHOLE_BEAN"],
    );
    setOriginCountry(p.originCountry || "");
    setWeightGrams(String(p.weightGrams || 250));
    setPriceEgp(String((p.priceCents / 100).toFixed(2)));
    setDiscountPercent(String(p.discountPercent || 0));
    setStock(String(p.stock));
    setFlavorNotes((p.flavorNotes || []).join(", "));
    setImages(p.imageUrls || []);
    clearNewFiles();
    setIsActive(Boolean(p.isActive));
    setError(null);
    setModalOpen(true);
  };

  const toggleGrind = (g: GrindType) => {
    setAvailableGrinds((prev) =>
      prev.includes(g) ? prev.filter((item) => item !== g) : [...prev, g],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      const priceCents = Math.max(1, Math.round(Number(priceEgp) * 100));
      const payload = {
        name: name.trim(),
        ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
        sku: sku.trim().toUpperCase(),
        ...(description.trim() ? { description: description.trim() } : {}),
        brandId,
        categoryId,
        roastLevel,
        availableGrinds:
          availableGrinds.length > 0 ? availableGrinds : ["WHOLE_BEAN"],
        flavorNotes: flavorNotes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        originCountry: originCountry.trim() || undefined,
        weightGrams: Math.max(50, Math.round(Number(weightGrams) || 250)),
        priceCents,
        discountPercent: Math.min(
          90,
          Math.max(0, Math.round(Number(discountPercent) || 0)),
        ),
        stock: Math.max(0, Math.round(Number(stock) || 0)),
        isActive,
        status: isActive ? "ACTIVE" : "DRAFT",
        imageUrls: images,
      };

      const url = editing
        ? `/api/products/${encodeURIComponent(editing.id)}`
        : "/api/products";
      let res: Response;
      if (newFiles.length > 0) {
        // Multipart: the API uploads the files to S3 and appends them after the kept images
        const form = new FormData();
        for (const [key, value] of Object.entries(payload)) {
          if (value === undefined || value === null) continue;
          form.append(key, Array.isArray(value) ? value.join(",") : String(value));
        }
        newFiles.forEach(({ file }) => form.append("images", file));
        res = await fetch(url, { method: editing ? "PATCH" : "POST", body: form });
      } else {
        res = await fetch(url, {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || t("Failed to save product"));
        return;
      }

      setModalOpen(false);
      clearNewFiles();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Failed to save product"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: IProduct) => {
    await fetch(`/api/products/${encodeURIComponent(p.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    await onRefresh();
  };

  const handleDelete = async (p: IProduct) => {
    if (!window.confirm(t("Delete this product?"))) return;
    await fetch(`/api/products/${encodeURIComponent(p.id)}`, {
      method: "DELETE",
    });
    await onRefresh();
  };

  const filtered = products.filter((p) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.originCountry || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{t("Coffee catalog")}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">{num(products.length)} · {t("Products")}</p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="lo-btn lo-btn-primary h-8 text-xs px-3"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{t("New product")}</span>
        </button>
      </div>

      <div className="lo-card overflow-x-auto">
        <table className="lo-table">
          <thead>
            <tr>
              <th>{t("SKU")}</th>
              <th>{t("Product")}</th>
              <th>{t("Roast")}</th>
              <th>{t("Price (EGP)")}</th>
              <th>{t("Stock")}</th>
              <th>{t("Sold / views")}</th>
              <th>{t("Status")}</th>
              <th className="text-right">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs text-[var(--muted-foreground)]">
                  {p.sku}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    {p.imageUrls?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrls[0]} alt="" className="h-8 w-8 object-contain rounded bg-[var(--muted)] shrink-0" />
                    )}
                    <div className="font-medium text-xs text-[var(--foreground)]">
                      {lang === "ar" && p.nameAr ? p.nameAr : p.name}
                    </div>
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {(lang === "ar" ? p.originCountryAr : null) || p.originCountry || "—"} · {num(p.weightGrams)}g
                  </div>
                </td>
                <td className="font-mono text-xs">{p.roastLevel}</td>
                <td className="font-mono text-xs font-medium">
                  {money(p.finalPriceCents)}
                </td>
                <td>
                  <span
                    className={`font-mono text-xs ${
                      p.stock <= 0
                        ? "text-[var(--destructive)]"
                        : p.stock <= 15
                          ? "text-[var(--warning)]"
                          : "text-[var(--success)]"
                    }`}
                  >
                    {num(p.stock)}
                  </span>
                </td>
                <td className="font-mono text-xs text-[var(--muted-foreground)]">
                  {num(p.soldCount)} / {num(p.viewsCount)}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(p)}
                    className="lo-badge lo-badge-outline text-[11px] cursor-pointer"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full me-1.5 ${
                        p.isActive ? "bg-[var(--success)]" : "bg-[var(--warning)]"
                      }`}
                    />
                    {t(p.isActive ? "ACTIVE" : "DRAFT")}
                  </button>
                </td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => openEditModal(p)}
                    className="lo-btn lo-btn-ghost h-7 px-2 text-xs"
                    aria-label={`${t("Edit")} ${p.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="lo-btn lo-btn-ghost h-7 px-2 text-xs text-[var(--destructive)]"
                    aria-label={`${t("Delete")} ${p.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="lo-card w-full max-w-[620px] max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-semibold">
                {editing ? `${t("Edit")} · ${editing.sku}` : t("New product")}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="lo-btn lo-btn-ghost p-1"
                aria-label={t("Close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Product name")} *
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="lo-input w-full h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Arabic name")}
                  </label>
                  <input
                    dir="rtl"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    className="lo-input w-full h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("SKU")} *
                  </label>
                  <input
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    className="lo-input w-full h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Brand")} *
                  </label>
                  <select
                    required
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="lo-input w-full h-8 text-xs"
                  >
                    {brands.map((b) => (
                      <option key={b.id || b._id} value={b.id || b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Category")} *
                  </label>
                  <select
                    required
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="lo-input w-full h-8 text-xs"
                  >
                    {categories.map((c) => (
                      <option key={c.id || c._id} value={c.id || c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Price (EGP)")} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    value={priceEgp}
                    onChange={(e) => setPriceEgp(e.target.value)}
                    className="lo-input w-full h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Discount (%)")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className="lo-input w-full h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Stock")} *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="lo-input w-full h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Weight (g)")}
                  </label>
                  <input
                    type="number"
                    min="50"
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(e.target.value)}
                    className="lo-input w-full h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Roast level")}
                  </label>
                  <select
                    value={roastLevel}
                    onChange={(e) =>
                      setRoastLevel(e.target.value as RoastLevel)
                    }
                    className="lo-input w-full h-8 text-xs"
                  >
                    {ROAST_LEVELS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Origin")}
                  </label>
                  <input
                    value={originCountry}
                    onChange={(e) => setOriginCountry(e.target.value)}
                    className="lo-input w-full h-8 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                  {t("Available grinds")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_GRINDS.map((g) => {
                    const active = availableGrinds.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGrind(g)}
                        className={`lo-btn h-7 text-[11px] px-2 ${
                          active ? "lo-btn-primary" : "lo-btn-outline"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                    {t("Flavour notes (comma separated)")}
                  </label>
                  <input
                    value={flavorNotes}
                    onChange={(e) => setFlavorNotes(e.target.value)}
                    className="lo-input w-full h-8 text-xs"
                  />
                </div>
                <div />
              </div>

              <div>
                <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                  {t("Product photos")}
                </label>
                <div
                  className={`rounded-lg border border-dashed p-3 transition-colors ${
                    dragging ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {images.map((src, i) => (
                      <div key={src} className="relative h-20 w-20 rounded-md bg-[var(--muted)] overflow-hidden group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-contain" />
                        {i === 0 && (
                          <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-[var(--primary)] text-[var(--primary-foreground)]">
                            {t("Cover")}
                          </span>
                        )}
                        <div className="absolute top-0.5 end-0.5 flex gap-0.5">
                          {i > 0 && (
                            <button
                              type="button"
                              title={t("Make cover")}
                              aria-label={t("Make cover")}
                              onClick={() => setImages((prev) => [src, ...prev.filter((u) => u !== src)])}
                              className="h-5 w-5 grid place-items-center rounded bg-black/60 text-white"
                            >
                              <Star className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            title={t("Remove")}
                            aria-label={t("Remove")}
                            onClick={() => setImages((prev) => prev.filter((u) => u !== src))}
                            className="h-5 w-5 grid place-items-center rounded bg-black/60 text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {newFiles.map(({ url: src }, i) => (
                      <div key={src} className="relative h-20 w-20 rounded-md bg-[var(--muted)] overflow-hidden ring-1 ring-[var(--primary)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/60 text-white">
                          {t("New")}
                        </span>
                        <button
                          type="button"
                          aria-label={t("Remove")}
                          onClick={() =>
                            setNewFiles((prev) => {
                              URL.revokeObjectURL(prev[i].url);
                              return prev.filter((_, j) => j !== i);
                            })
                          }
                          className="absolute top-0.5 end-0.5 h-5 w-5 grid place-items-center rounded bg-black/60 text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {newFiles.length < MAX_NEW_FILES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-20 w-20 rounded-md border border-dashed border-[var(--border)] grid place-items-center text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                      >
                        <span className="flex flex-col items-center gap-1 text-[10px]">
                          <ImagePlus className="h-5 w-5" />
                          {t("Upload")}
                        </span>
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                    {t("Drag photos here or click Upload. JPG, PNG, WEBP or AVIF, up to 5 MB each, 5 per save. The first photo is the cover.")}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    multiple
                    hidden
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
                  {t("Description")}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="lo-input w-full p-2 text-xs"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>{t("Active on public storefront")}</span>
              </label>

              {error && (
                <div className="p-2.5 rounded border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-xs text-[var(--destructive)]">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="lo-btn lo-btn-outline h-8 px-3 text-xs"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="lo-btn lo-btn-primary h-8 px-4 text-xs"
                >
                  {saving ? t("Saving…") : editing ? t("Update product") : t("Create product")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
