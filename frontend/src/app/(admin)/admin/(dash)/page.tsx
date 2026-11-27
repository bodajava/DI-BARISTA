"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarList, TrendChart, type TrendPoint } from "@/components/admin/charts";
import { Button, Empty, ErrorLine, PageTitle, Panel, Segmented, Skeleton, SkeletonRows, StatusLine, Toggle } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { api, get } from "@/lib/admin/api";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/admin/push";
import { deltaTrend, lastDays } from "@/lib/admin/range";
import type { OrderStatus } from "@/lib/admin/types";

type QueueOrder = { id: string; orderNumber: string; customerName: string; totalCents: number; createdAt: string };
type Stage = { status: OrderStatus; orders: QueueOrder[]; count: number };
type Queue = { toPrepare: Stage; toShip: Stage; toDeliver: Stage; waitingPayment: number; unpaidExpiryMinutes: number };
type Kpis = {
  revenueCents: number;
  orders: number;
  averageOrderCents: number;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
  visitors: number;
  conversion: number;
};
type Overview = { current: Kpis; change: Record<string, number | null>; range: { days: number } };
type Insight = { severity: "HIGH" | "MEDIUM" | "INFO"; productId: string; title: { en: string; ar: string }; description: { en: string; ar: string } };
type TopRow = { productId: string; name: string; nameAr: string | null; sold: number; revenueCents: number };
type LowRow = { productId: string; variantId: string | null; name: string; nameAr: string | null; variantLabel: string | null; sku: string; stock: number };

const STAGES: Array<{ key: "toPrepare" | "toShip" | "toDeliver"; title: string; action: string; next: OrderStatus }> = [
  { key: "toPrepare", title: "To prepare", action: "Start preparing", next: "PREPARING" },
  { key: "toShip", title: "To ship", action: "Mark shipped", next: "SHIPPED" },
  { key: "toDeliver", title: "To deliver", action: "Mark delivered", next: "DELIVERED" },
];

const NEXT_LABEL: Record<string, string> = { PREPARING: "Preparing", SHIPPED: "On the way", DELIVERED: "Delivered" };

function OrderQueue() {
  const { t, money, ago } = useAdmin();
  const qc = useQueryClient();
  const [line, setLine] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const queue = useQuery({ queryKey: ["admin", "queue"], queryFn: () => get<Queue>("admin/queue") });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus; number: string }) =>
      api(`orders/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: (_d, v) => {
      setLine({ msg: t("Order {n} is now {s}.", { n: v.number, s: t(NEXT_LABEL[v.status]) }), tone: "ok" });
      qc.invalidateQueries({ queryKey: ["admin", "queue"] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });
  const q = queue.data;
  const empty = q && !q.toPrepare.count && !q.toShip.count && !q.toDeliver.count;

  return (
    <Panel
      title={t("Orders to handle")}
      action={
        q && q.waitingPayment > 0 ? (
          <Link href="/admin/orders?status=PENDING_PAYMENT" className="text-sm underline-offset-4 hover:underline" title={t("Unpaid orders cancel themselves after {m} minutes.", { m: q.unpaidExpiryMinutes })}>
            {t("Waiting for the customer to pay: {n}", { n: q.waitingPayment })}
          </Link>
        ) : null
      }
    >
      {queue.isPending ? (
        <SkeletonRows rows={3} />
      ) : queue.error ? (
        <ErrorLine error={queue.error} />
      ) : empty ? (
        <Empty>{t("Nothing to handle. New orders show up here.")}</Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {STAGES.map((stage) => {
            const s = q![stage.key];
            return (
              <div key={stage.key} className="min-w-0">
                <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
                  {t(stage.title)} <span className="tabular-nums text-[var(--muted-foreground)]">{s.count}</span>
                </h3>
                {s.orders.length === 0 ? (
                  <p className="py-3 text-sm text-[var(--muted-foreground)]">—</p>
                ) : (
                  <ul className="adm-list">
                    {s.orders.map((o) => (
                      <li key={o.id} className="grid gap-2 py-3">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <Link href={`/admin/orders/${o.id}`} className="adm-mono min-w-0 truncate font-semibold hover:underline">
                            {o.orderNumber}
                          </Link>
                          <span className="flex-none text-sm tabular-nums">{money(o.totalCents)}</span>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-2 text-sm text-[var(--muted-foreground)]">
                          <span className="min-w-0 truncate">
                            {o.customerName} · {ago(o.createdAt)}
                          </span>
                          <Button
                            variant="primary"
                            className="!min-h-8 !px-3 !text-xs"
                            pending={move.isPending && move.variables?.id === o.id}
                            onClick={() => move.mutate({ id: o.id, status: stage.next, number: o.orderNumber })}
                          >
                            {t(stage.action)}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {s.count > s.orders.length ? (
                  <Link href={`/admin/orders?status=${s.status}`} className="mt-1 inline-block text-sm text-[var(--muted-foreground)] hover:underline">
                    {t("See all {n}", { n: s.count })}
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <StatusLine message={line?.msg} tone={line?.tone} />
    </Panel>
  );
}

function PushToggle() {
  const { t, lang } = useAdmin();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    pushState().then(setState).catch(() => setState("unsupported"));
  }, []);
  if (!state) return null;
  const note: Record<PushState, string> = {
    unsupported: "This browser can't show notifications.",
    "not-configured": "Notifications aren't set up on the server yet.",
    blocked: "Notifications are blocked for this site. Allow them in the browser settings.",
    off: "",
    on: "",
  };
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-[var(--muted-foreground)]">
          {t("Get a notification on this device for every new order, new message and piece running low.")}
        </p>
        {state === "on" || state === "off" ? (
          <Toggle
            label={t("Alerts on this device")}
            checked={state === "on"}
            disabled={busy}
            onChange={async (on) => {
              setBusy(true);
              setErr(null);
              try {
                setState(on ? await enablePush(lang) : await disablePush());
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : (
          <span className="text-sm text-[var(--muted-foreground)]">{t(note[state])}</span>
        )}
      </div>
      {err ? <ErrorLine error={err} /> : null}
    </Panel>
  );
}

function Kpi({ label, value, sub, change, days }: { label: string; value?: string; sub?: string; change?: number | null; days: number }) {
  const { t, pct } = useAdmin();
  const trend = deltaTrend(change);
  return (
    <Panel>
      <div className="adm-kpi">
        <span className="adm-kpi-label">{label}</span>
        {value === undefined ? <Skeleton className="h-8 w-28" /> : <span className="adm-kpi-value">{value}</span>}
        {sub ? <span className="text-xs text-[var(--muted-foreground)]">{sub}</span> : null}
        {change !== undefined ? (
          <span className="text-xs text-[var(--muted-foreground)]">
            {change === null ? (
              "—"
            ) : (
              <span className="adm-delta" data-trend={trend}>
                {trend === "up" ? "▲" : trend === "down" ? "▼" : ""} {pct(Math.abs(change))}
              </span>
            )}{" "}
            {t("vs. the previous {d} days", { d: days })}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

export default function OverviewPage() {
  const { t, money, num, pct, lang } = useAdmin();
  const [days, setDays] = useState(30);
  const range = useMemo(() => lastDays(days), [days]);

  const overview = useQuery({ queryKey: ["admin", "overview", range], queryFn: () => get<Overview>("admin/analytics/overview", range) });
  const trend = useQuery({
    queryKey: ["admin", "overview", "trend", range],
    queryFn: () => get<{ granularity: string; points: TrendPoint[] }>("admin/analytics/sales-trend", range),
  });
  const insights = useQuery({ queryKey: ["admin", "overview", "insights", range], queryFn: () => get<Insight[]>("admin/analytics/insights", { ...range, limit: 5 }) });
  const top = useQuery({ queryKey: ["admin", "overview", "top", range], queryFn: () => get<TopRow[]>("admin/analytics/top-products", { ...range, limit: 8 }) });
  const low = useQuery({ queryKey: ["admin", "lowstock"], queryFn: () => get<LowRow[]>("admin/inventory/low-stock") });

  const k = overview.data?.current;
  const c = overview.data?.change;
  const sev: Record<Insight["severity"], [string, string]> = { HIGH: ["Urgent", "red"], MEDIUM: ["Watch", "amber"], INFO: ["Note", "brand"] };

  return (
    <>
      <PageTitle
        title={t("Overview")}
        aside={
          <Segmented
            label={t("Period")}
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: t("7 days") },
              { value: 30, label: t("30 days") },
              { value: 90, label: t("90 days") },
            ]}
          />
        }
      />
      <div className="grid gap-4">
        <OrderQueue />
        <PushToggle />
        <ErrorLine error={overview.error} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label={t("Revenue")} value={k && money(k.revenueCents)} change={c?.revenueCents} days={days} />
          <Kpi label={t("Orders")} value={k && num(k.orders)} change={c?.orders} days={days} />
          <Kpi label={t("Average order")} value={k && money(k.averageOrderCents)} change={c?.averageOrderCents} days={days} />
          <Kpi
            label={t("Customers")}
            value={k && num(k.customers)}
            sub={k ? t("{a} new · {b} returning", { a: num(k.newCustomers), b: num(k.returningCustomers) }) : undefined}
            change={c?.customers}
            days={days}
          />
          <Kpi label={t("Conversion")} value={k && pct(k.conversion)} sub={k ? t("{n} visitors", { n: num(k.visitors) }) : undefined} change={c?.conversion} days={days} />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title={t("Sales trend")} className="xl:col-span-2">
            {trend.isPending ? (
              <Skeleton className="h-52 w-full" />
            ) : trend.error ? (
              <ErrorLine error={trend.error} />
            ) : !trend.data?.points.some((p) => p.revenueCents > 0) ? (
              <Empty>{t("No sales in this period yet.")}</Empty>
            ) : (
              <TrendChart points={trend.data.points} granularity={trend.data.granularity} />
            )}
          </Panel>
          <Panel title={t("Insights")}>
            {insights.isPending ? (
              <SkeletonRows rows={3} />
            ) : !insights.data?.length ? (
              <Empty>{t("Nothing needs your attention right now.")}</Empty>
            ) : (
              <ul className="grid gap-3">
                {insights.data.map((i, idx) => (
                  <li key={idx} className="rounded-2xl border border-[var(--border)] p-3">
                    <span className="adm-chip" data-tone={sev[i.severity][1]}>
                      {t(sev[i.severity][0])}
                    </span>
                    <Link href={`/admin/products/${i.productId}`} className="mt-2 block font-semibold hover:underline">
                      {i.title[lang]}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{i.description[lang]}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t("Top pieces")} className="xl:col-span-2">
            {top.isPending ? (
              <SkeletonRows rows={4} />
            ) : !top.data?.length ? (
              <Empty>{t("No sales in this period yet.")}</Empty>
            ) : (
              <BarList
                rows={top.data.map((r, i) => ({
                  key: r.productId,
                  label: `${i + 1}. ${(lang === "ar" && r.nameAr) || r.name}`,
                  value: r.revenueCents,
                  sub: t("{n} sold", { n: num(r.sold) }),
                }))}
                format={money}
              />
            )}
          </Panel>
          <Panel title={t("Low stock")}>
            {low.isPending ? (
              <SkeletonRows rows={4} />
            ) : !low.data?.length ? (
              <Empty>{t("Everything is well stocked.")}</Empty>
            ) : (
              <ul className="adm-list">
                {low.data.slice(0, 10).map((r) => (
                  <li key={`${r.productId}-${r.variantId ?? ""}`} className="adm-row justify-between">
                    <Link href={`/admin/products/${r.productId}`} className="min-w-0">
                      <span className="block truncate text-sm font-semibold hover:underline">
                        {(lang === "ar" && r.nameAr) || r.name}
                        {r.variantLabel ? ` · ${r.variantLabel}` : ""}
                      </span>
                      <span className="adm-mono text-[var(--muted-foreground)]">{r.sku}</span>
                    </Link>
                    <span className="adm-chip" data-tone={r.stock <= 0 ? "red" : "amber"}>
                      {r.stock <= 0 ? t("Sold out") : t("{n} left", { n: r.stock })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
