"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Button,
  Empty,
  ErrorLine,
  Field,
  METHOD_LABEL,
  PageTitle,
  Pagination,
  Panel,
  PaymentText,
  PAYMENT_LABEL,
  SkeletonRows,
  StatusBadge,
  STATUS_LABEL,
} from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { getPage } from "@/lib/admin/api";
import type { Order, OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/admin/types";
import { useDebounced, useUrlState } from "@/lib/admin/url-state";

const TABS: Array<OrderStatus | "ALL"> = ["ALL", "PENDING_PAYMENT", "CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

function OrdersInner() {
  const { t, tn, money, dateOnly, time } = useAdmin();
  const url = useUrlState();
  const status = url.get("status");
  const page = Number(url.get("page", "1")) || 1;
  const [search, setSearch] = useState(url.get("q"));
  const q = useDebounced(search);

  useEffect(() => {
    if (q !== url.get("q")) url.set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = {
    status,
    paymentStatus: url.get("payment"),
    paymentMethod: url.get("method"),
    search: url.get("q"),
    fromDate: url.get("from"),
    toDate: url.get("to"),
    customer: url.get("customer"),
    page,
    limit: 20,
    withCounts: "1",
  };
  const orders = useQuery({
    queryKey: ["admin", "orders", query],
    queryFn: () => getPage<Order>("orders", query),
    placeholderData: keepPreviousData,
  });
  const counts = orders.data?.meta?.counts ?? {};
  const docs = orders.data?.data ?? [];
  const filtered = Boolean(status || query.paymentStatus || query.paymentMethod || query.search || query.fromDate || query.toDate || query.customer);
  const customerName = query.customer ? docs[0]?.customerName ?? query.customer : null;

  return (
    <>
      <PageTitle title={t("Orders")} aside={<span className="text-sm text-[var(--muted-foreground)]">{tn("{n} order|{n} orders", orders.data?.meta?.totalDocs ?? 0)}</span>} />

      {query.customer ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--accent)] px-4 py-3 text-sm">
          <span>{t("Orders from {name}", { name: customerName ?? "" })}</span>
          <button type="button" className="adm-icon-btn" aria-label={t("Show all orders")} onClick={() => url.set({ customer: null })}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div role="tablist" aria-label={t("Order status")} className="adm-tabs mb-4">
        {TABS.map((tab) => {
          const value = tab === "ALL" ? "" : tab;
          return (
            <button key={tab} type="button" role="tab" aria-selected={status === value} onClick={() => url.set({ status: value })}>
              {tab === "ALL" ? t("All") : t(STATUS_LABEL[tab])} <span>{counts[tab] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <Panel className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
          <Field label={t("Search")}>
            {(id) => (
              <input id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Order number, name, email or phone")} />
            )}
          </Field>
          <Field label={t("Payment")}>
            {(id) => (
              <select id={id} value={query.paymentStatus} onChange={(e) => url.set({ payment: e.target.value })}>
                <option value="">{t("Any")}</option>
                {(Object.keys(PAYMENT_LABEL) as PaymentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {t(PAYMENT_LABEL[s])}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("Method")}>
            {(id) => (
              <select id={id} value={query.paymentMethod} onChange={(e) => url.set({ method: e.target.value })}>
                <option value="">{t("Any")}</option>
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {t(METHOD_LABEL[m])}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("From")}>{(id) => <input id={id} type="date" value={query.fromDate} onChange={(e) => url.set({ from: e.target.value })} />}</Field>
          <Field label={t("To")}>{(id) => <input id={id} type="date" value={query.toDate} onChange={(e) => url.set({ to: e.target.value })} />}</Field>
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              url.set({ status: null, payment: null, method: null, q: null, from: null, to: null, customer: null });
            }}
          >
            {t("Clear")}
          </Button>
        </div>
      </Panel>

      <Panel>
        <ErrorLine error={orders.error} />
        {orders.isPending ? (
          <SkeletonRows rows={8} />
        ) : docs.length === 0 ? (
          <Empty>{filtered ? t("No orders match these filters.") : t("No orders yet. They appear here as soon as customers check out.")}</Empty>
        ) : (
          <div className="overflow-x-auto" aria-busy={orders.isFetching || url.pending}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t("Order")}</th>
                  <th>{t("Date")}</th>
                  <th>{t("Customer")}</th>
                  <th className="adm-num">{t("Pieces")}</th>
                  <th className="adm-num">{t("Total")}</th>
                  <th>{t("Payment")}</th>
                  <th>{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((o) => (
                  <tr key={o.id}>
                    <td className="adm-cell-title">
                      <Link href={`/admin/orders/${o.id}`} className="adm-mono font-semibold hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td data-label={t("Date")}>
                      {dateOnly(o.createdAt)} <span className="text-[var(--muted-foreground)]">{time(o.createdAt)}</span>
                    </td>
                    <td data-label={t("Customer")}>
                      <Link href={`/admin/customers/${encodeURIComponent(o.userId || o.customerEmail)}`} className="hover:underline">
                        {o.customerName}
                      </Link>
                    </td>
                    <td data-label={t("Pieces")} className="adm-num">
                      {o.itemsCount ?? 0}
                    </td>
                    <td data-label={t("Total")} className="adm-num">
                      {money(o.totalCents)}
                    </td>
                    <td data-label={t("Payment")}>
                      <span className="grid">
                        <span className="text-sm">{t(METHOD_LABEL[o.paymentMethod])}</span>
                        <PaymentText status={o.paymentStatus} />
                      </span>
                    </td>
                    <td data-label={t("Status")}>
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={orders.data?.meta?.totalPages ?? 1} onPage={(p) => url.set({ page: p })} />
      </Panel>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <OrdersInner />
    </Suspense>
  );
}
