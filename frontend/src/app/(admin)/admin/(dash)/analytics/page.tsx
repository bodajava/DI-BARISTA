"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BarList, TrendChart, type TrendPoint } from "@/components/admin/charts";
import { Empty, ErrorLine, METHOD_LABEL, PageTitle, Panel, Segmented, Skeleton, SkeletonRows, STATUS_LABEL } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { get } from "@/lib/admin/api";
import { lastDays } from "@/lib/admin/range";
import type { OrderStatus, PaymentMethod } from "@/lib/admin/types";

type Slice = { key: string; keyAr?: string | null; orders: number; cents: number; share: number };
type Breakdown = { byStatus: Slice[]; byMethod: Slice[]; byCategory: Slice[]; byGovernorate: Slice[]; byWeekday: Slice[] };
type Customers = {
  newCustomers: number;
  returningCustomers: number;
  repeatRate: number;
  guestShare: number;
  top: Array<{ identifier: string; name: string; email: string; hasAccount: boolean; orders: number; spentCents: number; lastOrderAt: string }>;
};
type Perf = {
  productId: string;
  name: string;
  nameAr: string | null;
  views: number;
  sold: number;
  conversion: number;
  revenueCents: number;
  profitCents: number | null;
  rating: number | null;
  returns: number;
  stock: number;
  hidden: boolean;
  deleted: boolean;
};
type SortKey = "revenue" | "sold" | "conversion" | "views" | "returns";

const WEEKDAY: Record<string, [string, string]> = {
  "1": ["Monday", "الاتنين"],
  "2": ["Tuesday", "التلات"],
  "3": ["Wednesday", "الأربع"],
  "4": ["Thursday", "الخميس"],
  "5": ["Friday", "الجمعة"],
  "6": ["Saturday", "السبت"],
  "7": ["Sunday", "الحد"],
};

export default function AnalyticsPage() {
  const { t, money, num, pct, lang, dateOnly } = useAdmin();
  const [days, setDays] = useState(30);
  const [group, setGroup] = useState<"auto" | "day" | "week" | "month">("auto");
  const [sortBy, setSortBy] = useState<SortKey>("revenue");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const range = useMemo(() => lastDays(days), [days]);

  const trend = useQuery({
    queryKey: ["admin", "analytics", "trend", range, group],
    queryFn: () => get<{ granularity: string; points: TrendPoint[] }>("admin/analytics/sales-trend", { ...range, granularity: group }),
  });
  const breakdown = useQuery({ queryKey: ["admin", "analytics", "breakdown", range], queryFn: () => get<Breakdown>("admin/analytics/breakdown", range) });
  const customers = useQuery({ queryKey: ["admin", "analytics", "customers", range], queryFn: () => get<Customers>("admin/analytics/customers", { ...range, limit: 10 }) });
  const perf = useQuery({
    queryKey: ["admin", "analytics", "perf", range, sortBy, order],
    queryFn: () => get<Perf[]>("admin/analytics/products-performance", { ...range, sortBy, order, limit: 100 }),
  });

  const sortHeader = (key: SortKey, label: string) => (
    <th className="adm-num" aria-sort={sortBy === key ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => {
          if (sortBy === key) setOrder(order === "asc" ? "desc" : "asc");
          else (setSortBy(key), setOrder("desc"));
        }}
      >
        {label} {sortBy === key ? (order === "asc" ? "↑" : "↓") : ""}
      </button>
    </th>
  );

  const b = breakdown.data;
  const bars = (rows: Slice[] | undefined, label: (s: Slice) => string, value: (s: Slice) => number, fmt: (n: number) => string, sub?: (s: Slice) => string) =>
    !rows ? (
      <SkeletonRows rows={4} />
    ) : rows.length === 0 ? (
      <Empty>{t("No sales in this period yet.")}</Empty>
    ) : (
      <BarList rows={rows.map((r) => ({ key: r.key, label: label(r), value: value(r), sub: sub?.(r) }))} format={fmt} />
    );

  return (
    <>
      <PageTitle
        title={t("Analytics")}
        aside={
          <Segmented
            label={t("Period")}
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: t("7 days") },
              { value: 30, label: t("30 days") },
              { value: 90, label: t("90 days") },
              { value: 365, label: t("1 year") },
            ]}
          />
        }
      />
      <div className="grid gap-4">
        <Panel
          title={t("Sales over time")}
          action={
            <Segmented
              label={t("Group by")}
              value={group}
              onChange={setGroup}
              options={[
                { value: "auto", label: t("Auto") },
                { value: "day", label: t("Day") },
                { value: "week", label: t("Week") },
                { value: "month", label: t("Month") },
              ]}
            />
          }
        >
          {trend.isPending ? (
            <Skeleton className="h-52 w-full" />
          ) : trend.error ? (
            <ErrorLine error={trend.error} />
          ) : !trend.data?.points.length ? (
            <Empty>{t("No sales in this period yet.")}</Empty>
          ) : (
            <TrendChart points={trend.data.points} granularity={trend.data.granularity} />
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Panel title={t("Orders by status")}>
            <p className="mb-3 text-xs text-[var(--muted-foreground)]">{t("Every order placed in the period, paid or not.")}</p>
            {bars(b?.byStatus, (s) => t(STATUS_LABEL[s.key as OrderStatus] ?? s.key), (s) => s.orders, num)}
          </Panel>
          <Panel title={t("How customers pay")}>
            {bars(b?.byMethod, (s) => t(METHOD_LABEL[s.key as PaymentMethod] ?? s.key), (s) => s.cents, money, (s) => pct(s.share))}
          </Panel>
          <Panel title={t("Sales by category")}>
            {bars(b?.byCategory, (s) => (lang === "ar" && s.keyAr) || s.key, (s) => s.cents, money, (s) => pct(s.share))}
          </Panel>
          <Panel title={t("Where orders go")}>
            {bars(b?.byGovernorate, (s) => s.key, (s) => s.orders, num)}
          </Panel>
          <Panel title={t("Busiest days")}>
            {bars(b?.byWeekday, (s) => WEEKDAY[s.key]?.[lang === "ar" ? 1 : 0] ?? s.key, (s) => s.orders, num)}
          </Panel>
          <Panel title={t("Customers")}>
            {customers.isPending ? (
              <SkeletonRows rows={4} />
            ) : customers.data ? (
              <dl className="grid grid-cols-2 gap-4">
                {[
                  [t("New"), num(customers.data.newCustomers)],
                  [t("Returning"), num(customers.data.returningCustomers)],
                  [t("Came back to buy again"), pct(customers.data.repeatRate)],
                  [t("Orders without an account"), pct(customers.data.guestShare)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-[var(--muted-foreground)]">{k}</dt>
                    <dd className="adm-kpi-value !text-xl">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ErrorLine error={customers.error} />
            )}
          </Panel>
        </div>

        <Panel title={t("Top customers")}>
          {customers.isPending ? (
            <SkeletonRows rows={5} />
          ) : !customers.data?.top.length ? (
            <Empty>{t("No sales in this period yet.")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{t("Customer")}</th>
                    <th className="adm-num">{t("Orders")}</th>
                    <th className="adm-num">{t("Spent")}</th>
                    <th>{t("Last order")}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.data.top.map((c) => (
                    <tr key={c.identifier}>
                      <td className="adm-cell-title">
                        <Link href={`/admin/customers/${encodeURIComponent(c.identifier)}`} className="hover:underline">
                          {c.name || c.email}
                        </Link>{" "}
                        <span className="adm-chip" data-tone={c.hasAccount ? "green" : undefined}>
                          {c.hasAccount ? t("Account") : t("Guest")}
                        </span>
                      </td>
                      <td data-label={t("Orders")} className="adm-num">{num(c.orders)}</td>
                      <td data-label={t("Spent")} className="adm-num">{money(c.spentCents)}</td>
                      <td data-label={t("Last order")}>{dateOnly(c.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t("Performance by piece")}>
          <ErrorLine error={perf.error} />
          {perf.isPending ? (
            <SkeletonRows rows={8} />
          ) : !perf.data?.length ? (
            <Empty>{t("No products yet.")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{t("Piece")}</th>
                    {sortHeader("views", t("Views"))}
                    {sortHeader("sold", t("Sold"))}
                    {sortHeader("conversion", t("Conversion"))}
                    {sortHeader("revenue", t("Revenue"))}
                    <th className="adm-num">{t("Est. profit")}</th>
                    <th className="adm-num">{t("Rating")}</th>
                    {sortHeader("returns", t("Returns / cancels"))}
                    <th className="adm-num">{t("Stock")}</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.data.map((r) => (
                    <tr key={r.productId}>
                      <td className="adm-cell-title">
                        <Link href={`/admin/products/${r.productId}`} className="hover:underline">
                          {(lang === "ar" && r.nameAr) || r.name}
                        </Link>
                        {r.hidden && !r.deleted ? <span className="adm-chip ms-2">{t("Hidden")}</span> : null}
                        {r.deleted ? <span className="adm-chip ms-2" data-tone="red">{t("Deleted")}</span> : null}
                      </td>
                      <td data-label={t("Views")} className="adm-num">{num(r.views)}</td>
                      <td data-label={t("Sold")} className="adm-num">{num(r.sold)}</td>
                      <td data-label={t("Conversion")} className="adm-num">{r.views ? pct(r.conversion) : "—"}</td>
                      <td data-label={t("Revenue")} className="adm-num">{money(r.revenueCents)}</td>
                      <td data-label={t("Est. profit")} className="adm-num">{r.profitCents === null ? "—" : money(r.profitCents)}</td>
                      <td data-label={t("Rating")} className="adm-num">{r.rating ?? "—"}</td>
                      <td data-label={t("Returns / cancels")} className="adm-num">{num(r.returns)}</td>
                      <td data-label={t("Stock")} className="adm-num">{num(r.stock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
