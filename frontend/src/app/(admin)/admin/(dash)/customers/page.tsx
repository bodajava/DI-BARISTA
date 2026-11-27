"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { Empty, ErrorLine, Field, PageTitle, Pagination, Panel, SkeletonRows } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { getPage } from "@/lib/admin/api";
import { useDebounced, useUrlState } from "@/lib/admin/url-state";

type Customer = {
  identifier: string;
  name: string;
  email: string;
  phone: string;
  hasAccount: boolean;
  since: string;
  orders: number;
  spentCents: number;
  lastOrderAt: string;
  loyaltyPoints: number;
};

function CustomersInner() {
  const { t, tn, money, dateOnly, num } = useAdmin();
  const url = useUrlState();
  const page = Number(url.get("page", "1")) || 1;
  const [search, setSearch] = useState(url.get("q"));
  const q = useDebounced(search);
  useEffect(() => {
    if (q !== url.get("q")) url.set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const query = { search: url.get("q"), page, limit: 20 };
  const list = useQuery({
    queryKey: ["admin", "customers", query],
    queryFn: () => getPage<Customer>("admin/customers", query),
    placeholderData: keepPreviousData,
  });
  const docs = list.data?.data ?? [];

  return (
    <>
      <PageTitle title={t("Customers")} aside={<span className="text-sm text-[var(--muted-foreground)]">{tn("{n} customer|{n} customers", list.data?.meta?.totalDocs ?? 0)}</span>} />
      <Panel className="mb-4">
        <Field label={t("Search")}>
          {(id) => <input id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Name, email or phone")} />}
        </Field>
      </Panel>
      <Panel>
        <ErrorLine error={list.error} />
        {list.isPending ? (
          <SkeletonRows rows={8} />
        ) : docs.length === 0 ? (
          <Empty>{query.search ? t("No customers match this search.") : t("Customers appear here after their first order.")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t("Customer")}</th>
                  <th className="adm-num">{t("Orders")}</th>
                  <th className="adm-num">{t("Spent")}</th>
                  <th>{t("Last order")}</th>
                  <th className="adm-num">{t("Points")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {docs.map((c) => (
                  <tr key={c.identifier}>
                    <td className="adm-cell-title">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.name || c.email}</span>
                        <span className="adm-chip" data-tone={c.hasAccount ? "green" : undefined}>
                          {c.hasAccount ? t("Account") : t("Guest")}
                        </span>
                      </span>
                      <span className="block text-xs font-normal text-[var(--muted-foreground)]">
                        {c.email} · {t("Since {d}", { d: dateOnly(c.since) })}
                      </span>
                    </td>
                    <td data-label={t("Orders")} className="adm-num">{num(c.orders)}</td>
                    <td data-label={t("Spent")} className="adm-num">{money(c.spentCents)}</td>
                    <td data-label={t("Last order")}>{dateOnly(c.lastOrderAt)}</td>
                    <td data-label={t("Points")} className="adm-num">{num(c.loyaltyPoints)}</td>
                    <td>
                      <Link className="adm-btn" href={`/admin/customers/${encodeURIComponent(c.identifier)}`}>
                        {t("Open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onPage={(p) => url.set({ page: p })} />
      </Panel>
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <CustomersInner />
    </Suspense>
  );
}
