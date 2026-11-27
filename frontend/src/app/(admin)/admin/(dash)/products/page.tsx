"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useIsAdmin } from "@/components/admin/session";
import { ButtonLink, Empty, ErrorLine, Field, PageTitle, Pagination, Panel, Segmented, SkeletonRows } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { get, getPage } from "@/lib/admin/api";
import type { Category, Product } from "@/lib/admin/types";
import { useDebounced, useUrlState } from "@/lib/admin/url-state";

function ProductsInner() {
  const { t, tn, money, lang } = useAdmin();
  const isAdmin = useIsAdmin();
  const url = useUrlState();
  const show = (url.get("show") || "all") as "all" | "active" | "hidden" | "deleted";
  const page = Number(url.get("page", "1")) || 1;
  const [search, setSearch] = useState(url.get("q"));
  const q = useDebounced(search);
  useEffect(() => {
    if (q !== url.get("q")) url.set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = { show, categoryId: url.get("category"), search: url.get("q"), page, limit: 20 };
  const products = useQuery({
    queryKey: ["admin", "products", query],
    queryFn: () => getPage<Product>("products/admin/all", query),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: () => get<Category[]>("categories/admin/all") });
  const counts = products.data?.meta?.counts;
  const docs = products.data?.data ?? [];

  return (
    <>
      <PageTitle
        title={t("Products")}
        aside={
          <>
            <span className="text-sm text-[var(--muted-foreground)]">{tn("{n} product|{n} products", counts?.all ?? 0)}</span>
            {isAdmin ? (
              <ButtonLink href="/admin/products/new" variant="primary">
                <Plus size={15} /> {t("New product")}
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <Panel className="mb-4">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_2fr] md:items-end">
          <Segmented
            label={t("Show")}
            value={show}
            onChange={(v) => url.set({ show: v === "all" ? null : v })}
            options={[
              { value: "all", label: `${t("All")} ${counts?.all ?? ""}` },
              { value: "active", label: `${t("In the store")} ${counts?.active ?? ""}` },
              { value: "hidden", label: `${t("Hidden")} ${counts?.hidden ?? ""}` },
              { value: "deleted", label: `${t("Deleted")} ${counts?.deleted ?? ""}` },
            ]}
          />
          <Field label={t("Category")}>
            {(id) => (
              <select id={id} value={query.categoryId} onChange={(e) => url.set({ category: e.target.value })}>
                <option value="">{t("All categories")}</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(lang === "ar" && c.nameAr) || c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("Search")}>
            {(id) => <input id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Name or SKU")} />}
          </Field>
        </div>
      </Panel>
      <Panel>
        <ErrorLine error={products.error} />
        {products.isPending ? (
          <SkeletonRows rows={8} />
        ) : docs.length === 0 ? (
          <Empty>{t("No products match these filters.")}</Empty>
        ) : (
          <ul className="adm-list" aria-busy={products.isFetching}>
            {docs.map((p) => {
              const cat = typeof p.categoryId === "object" ? p.categoryId : null;
              const low = p.stock <= (p.lowStockThreshold ?? 5);
              return (
                <li key={p.id}>
                  <Link href={`/admin/products/${p.id}`} className="adm-row flex-wrap hover:bg-[var(--accent)] sm:flex-nowrap">
                    {p.imageUrls[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrls[0]} alt="" className="adm-thumb" />
                    ) : (
                      <span className="adm-thumb" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-[var(--muted-foreground)]">
                        {[p.nameAr, cat ? (lang === "ar" && cat.nameAr) || cat.name : null, p.variants?.length ? tn("{n} version|{n} versions", p.variants.length) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.isDeleted ? <span className="adm-chip" data-tone="red">{t("Deleted")}</span> : null}
                        {!p.isActive && !p.isDeleted ? <span className="adm-chip">{t("Hidden")}</span> : null}
                        {p.isFeatured ? <span className="adm-chip" data-tone="brand">{t("On the home page")}</span> : null}
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-semibold tabular-nums">{money(p.finalPriceCents)}</p>
                      {p.discountPercent > 0 ? <p className="text-xs text-[var(--muted-foreground)] line-through">{money(p.priceCents)}</p> : null}
                    </div>
                    <div className="w-28 text-end text-sm">
                      <span className="tabular-nums">{t("{n} in stock", { n: p.stock })}</span>
                      {p.stock <= 0 ? (
                        <span className="adm-chip ms-1" data-tone="red">{t("Sold out")}</span>
                      ) : low ? (
                        <span className="adm-chip ms-1" data-tone="amber">{t("Low")}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} totalPages={products.data?.meta?.totalPages ?? 1} onPage={(p) => url.set({ page: p })} />
      </Panel>
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <ProductsInner />
    </Suspense>
  );
}
