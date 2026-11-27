"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Empty, ErrorLine, Field, PageTitle, Panel, SkeletonRows, StatusLine, Toggle } from "@/components/admin/kit";
import { useIsAdmin } from "@/components/admin/session";
import { useAdmin } from "@/lib/admin-i18n";
import { api, get } from "@/lib/admin/api";
import type { Brand, Category } from "@/lib/admin/types";

type Kind = "categories" | "brands";
type Draft = {
  id?: string;
  name: string;
  nameAr: string;
  slug: string;
  description: string;
  descriptionAr: string;
  originCountry: string;
  parentId: string;
  isActive: boolean;
  file: File | null;
};
const empty: Draft = { name: "", nameAr: "", slug: "", description: "", descriptionAr: "", originCountry: "", parentId: "", isActive: true, file: null };

function Editor({
  kind,
  draft,
  categories,
  onDone,
}: {
  kind: Kind;
  draft: Draft;
  categories: Category[];
  onDone: () => void;
}) {
  const { t, lang } = useAdmin();
  const qc = useQueryClient();
  const [d, setD] = useState(draft);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      if (d.name.trim().length < 2) throw new Error("Enter a name");
      const fd = new FormData();
      fd.set("name", d.name.trim());
      fd.set("nameAr", d.nameAr.trim());
      if (d.slug.trim()) fd.set("slug", d.slug.trim());
      fd.set("description", d.description);
      fd.set("isActive", String(d.isActive));
      if (kind === "categories") {
        fd.set("descriptionAr", d.descriptionAr);
        fd.set("parentId", d.parentId);
        if (d.file) fd.set("image", d.file);
      } else {
        fd.set("originCountry", d.originCountry);
        if (d.file) fd.set("logo", d.file);
      }
      return d.id ? api(`${kind}/${d.id}`, { method: "PATCH", body: fd }) : api(kind, { method: "POST", body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", kind] });
      onDone();
    },
    onError: (e) => setErr((e as Error).message),
  });
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });

  return (
    <form
      className="mt-3 grid gap-3 rounded-2xl border border-[var(--border)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Name")}>{(id) => <input id={id} required value={d.name} onChange={set("name")} />}</Field>
        <Field label={t("Arabic name")}>{(id) => <input id={id} dir="rtl" value={d.nameAr} onChange={set("nameAr")} />}</Field>
        <Field label={t("Link name")} hint={t("Leave empty to use the name")}>{(id, h) => <input id={id} aria-describedby={h} value={d.slug} onChange={set("slug")} />}</Field>
        {kind === "categories" ? (
          <Field label={t("Sits inside")}>
            {(id) => (
              <select id={id} value={d.parentId} onChange={set("parentId")}>
                <option value="">{t("Top level")}</option>
                {categories
                  .filter((c) => c.id !== d.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {(lang === "ar" && c.nameAr) || c.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
        ) : (
          <Field label={t("Origin country")}>{(id) => <input id={id} value={d.originCountry} onChange={set("originCountry")} />}</Field>
        )}
      </div>
      <Field label={t("Description")}>{(id) => <textarea id={id} maxLength={1000} value={d.description} onChange={set("description")} />}</Field>
      {kind === "categories" ? (
        <Field label={t("Arabic description")}>{(id) => <textarea id={id} dir="rtl" maxLength={1000} value={d.descriptionAr} onChange={set("descriptionAr")} />}</Field>
      ) : null}
      <Field label={kind === "categories" ? t("Image") : t("Logo")}>
        {(id) => <input id={id} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setD({ ...d, file: e.target.files?.[0] ?? null })} />}
      </Field>
      <Toggle label={t("Visible in the store")} checked={d.isActive} onChange={(c) => setD({ ...d, isActive: c })} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" pending={save.isPending}>{d.id ? t("Save") : t("Add")}</Button>
        <Button onClick={onDone}>{t("Cancel")}</Button>
      </div>
      {err ? <ErrorLine error={err} /> : null}
    </form>
  );
}

function Manager({ kind }: { kind: Kind }) {
  const { t, tn, lang } = useAdmin();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [line, setLine] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const list = useQuery({ queryKey: ["admin", kind], queryFn: () => get<Array<Category & Brand>>(`${kind}/admin/all`) });
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: () => get<Category[]>("categories/admin/all"), enabled: kind === "categories" });
  const remove = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`${kind}/${id}`, { method: "DELETE" }),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ["admin", kind] }), setLine({ msg: t(r.data.message), tone: "ok" })),
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });

  const rows = list.data ?? [];
  // Tree order: parents first, children indented under them
  const ordered =
    kind === "categories"
      ? rows
          .filter((c) => !c.parentId || !rows.some((p) => p.id === c.parentId))
          .flatMap((p) => [{ ...p, depth: 0 }, ...rows.filter((c) => c.parentId === p.id).map((c) => ({ ...c, depth: 1 }))])
      : rows.map((r) => ({ ...r, depth: 0 }));

  return (
    <Panel
      title={kind === "categories" ? t("Categories") : t("Brands")}
      action={
        isAdmin && !editing ? (
          <Button onClick={() => setEditing({ ...empty })}>
            <Plus size={14} /> {kind === "categories" ? t("Add category") : t("Add brand")}
          </Button>
        ) : null
      }
    >
      {editing && !editing.id ? <Editor kind={kind} draft={editing} categories={categories.data ?? []} onDone={() => setEditing(null)} /> : null}
      <ErrorLine error={list.error} />
      {list.isPending ? (
        <SkeletonRows rows={5} />
      ) : ordered.length === 0 ? (
        <Empty>{t("Nothing here yet.")}</Empty>
      ) : (
        <ul className="adm-list mt-2">
          {ordered.map((c) => (
            <li key={c.id} className="py-2">
              <div className="adm-row !py-1" style={{ paddingInlineStart: c.depth * 24 }}>
                {c.imageUrl || c.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl || c.logoUrl || ""} alt="" className="adm-thumb !h-10 !w-10" />
                ) : (
                  <span className="adm-thumb !h-10 !w-10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {(lang === "ar" && c.nameAr) || c.name}
                    {!c.isActive ? <span className="adm-chip ms-2">{t("Hidden")}</span> : null}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    /{c.slug} · {tn("{n} product|{n} products", c.productCount ?? 0)}
                  </p>
                </div>
                {isAdmin ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="adm-icon-btn"
                      aria-label={t("Edit")}
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          name: c.name,
                          nameAr: c.nameAr ?? "",
                          slug: c.slug,
                          description: c.description ?? "",
                          descriptionAr: c.descriptionAr ?? "",
                          originCountry: c.originCountry ?? "",
                          parentId: c.parentId ?? "",
                          isActive: c.isActive,
                          file: null,
                        })
                      }
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="adm-icon-btn"
                      aria-label={t("Delete")}
                      onClick={() => window.confirm(t("Delete “{name}”?", { name: c.name })) && remove.mutate(c.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
              {editing?.id === c.id ? <Editor kind={kind} draft={editing} categories={categories.data ?? []} onDone={() => setEditing(null)} /> : null}
            </li>
          ))}
        </ul>
      )}
      <StatusLine message={line?.msg} tone={line?.tone} />
    </Panel>
  );
}

export default function CatalogPage() {
  const { t } = useAdmin();
  return (
    <>
      <PageTitle title={t("Catalog")} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Manager kind="categories" />
        <Manager kind="brands" />
      </div>
    </>
  );
}
