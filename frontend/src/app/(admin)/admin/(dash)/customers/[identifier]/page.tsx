"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Empty, ErrorLine, PageTitle, Panel, SkeletonRows, StatusBadge } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { get } from "@/lib/admin/api";
import type { OrderStatus } from "@/lib/admin/types";

type Detail = {
  identifier: string;
  name: string;
  email: string;
  phone: string | null;
  hasAccount: boolean;
  since: string | null;
  lastOrderAt: string | null;
  orders: number;
  spentCents: number;
  averageOrderCents: number;
  loyaltyPoints: number;
  addresses: Array<{ id: string; governorate?: string | null; city: string; street: string; building?: string; isDefault: boolean }>;
  orderList: Array<{ id: string; orderNumber: string; status: OrderStatus; totalCents: number; createdAt: string }>;
};

function wa(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("01") && d.length === 11) d = `2${d}`;
  return `https://wa.me/${d}`;
}

export default function CustomerPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const key = decodeURIComponent(identifier);
  const { t, money, num, dateOnly } = useAdmin();
  const c = useQuery({ queryKey: ["admin", "customers", "detail", key], queryFn: () => get<Detail>(`admin/customers/${encodeURIComponent(key)}`) });

  if (c.isPending) return <SkeletonRows rows={8} />;
  if (c.error || !c.data) return <ErrorLine error={c.error ?? "No customer with these details"} />;
  const d = c.data;
  const kpis: Array<[string, string]> = [
    [t("Orders"), num(d.orders)],
    [t("Total spent"), money(d.spentCents)],
    [t("Average order"), money(d.averageOrderCents)],
    [t("Customer since"), dateOnly(d.since)],
    [t("Last order"), dateOnly(d.lastOrderAt)],
    [t("Loyalty points"), num(d.loyaltyPoints)],
  ];
  return (
    <>
      <Link href="/admin/customers" className="mb-4 inline-block text-sm text-[var(--muted-foreground)] hover:underline">
        {t("All customers")}
      </Link>
      <PageTitle
        title={d.name || d.email}
        aside={<span className="adm-chip" data-tone={d.hasAccount ? "green" : undefined}>{d.hasAccount ? t("Account") : t("Guest")}</span>}
      />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value]) => (
          <Panel key={label}>
            <div className="adm-kpi">
              <span className="adm-kpi-label">{label}</span>
              <span className="adm-kpi-value !text-xl">{value}</span>
            </div>
          </Panel>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid content-start gap-4">
          <Panel title={t("Contact")}>
            <p className="text-sm">{d.email}</p>
            {d.phone ? <p className="text-sm" dir="ltr">{d.phone}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="adm-btn" href={`mailto:${d.email}`}><Mail size={14} /> {t("Email")}</a>
              {d.phone ? <a className="adm-btn" href={`tel:${d.phone}`}><Phone size={14} /> {t("Call")}</a> : null}
              {d.phone ? <a className="adm-btn" href={wa(d.phone)} target="_blank" rel="noopener"><MessageCircle size={14} /> WhatsApp</a> : null}
            </div>
          </Panel>
          <Panel title={t("Addresses")}>
            {!d.hasAccount ? <p className="mb-2 text-xs text-[var(--muted-foreground)]">{t("Ordered as a guest, without an account")}</p> : null}
            {d.addresses.length === 0 ? (
              <Empty>{t("No saved address.")}</Empty>
            ) : (
              <ul className="grid gap-2">
                {d.addresses.map((a) => (
                  <li key={a.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                    {[a.governorate, a.city].filter(Boolean).join(" · ")} — {a.street}
                    {a.isDefault ? <span className="adm-chip ms-2" data-tone="brand">{t("Default")}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <Panel
          title={t("Their orders")}
          className="xl:col-span-2"
          action={<Link className="text-sm hover:underline" href={`/admin/orders?customer=${encodeURIComponent(d.identifier)}`}>{t("Open in Orders")}</Link>}
        >
          {d.orderList.length === 0 ? (
            <Empty>{t("No orders yet.")}</Empty>
          ) : (
            <ul className="adm-list">
              {d.orderList.map((o) => (
                <li key={o.id} className="adm-row justify-between">
                  <Link href={`/admin/orders/${o.id}`} className="adm-mono font-semibold hover:underline">{o.orderNumber}</Link>
                  <span className="text-sm text-[var(--muted-foreground)]">{dateOnly(o.createdAt)}</span>
                  <StatusBadge status={o.status} />
                  <span className="w-24 text-end tabular-nums">{money(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
