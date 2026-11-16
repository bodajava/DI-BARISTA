"use client";

import React, { useMemo, useState } from "react";
import { Eye, RotateCcw, X } from "lucide-react";
import { useAdmin } from "@/lib/admin-i18n";
import { IOrder, IOrderItem, IOrderPaymentInfo, IProduct } from "@/lib/types";

interface AdminOrdersPanelProps {
  orders: IOrder[];
  /** Catalog, used to show each order line with its product photo */
  products?: IProduct[];
  searchFilter: string;
  onRefresh: () => Promise<void>;
}

// Statuses staff can choose. PAID comes only from a verified Paymob payment and REFUNDED
// only from the refund button; the API rejects them here.
const ORDER_STATUS_OPTIONS = [
  "PROCESSING",
  "ROASTING",
  "PACKING",
  "OUT_FOR_DELIVERY",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

const FINAL_STATUSES = ["DELIVERED", "CANCELLED", "REFUNDED"];

const STATUS_TONE: Record<string, string> = {
  DELIVERED: "bg-[var(--success)]",
  CANCELLED: "bg-[var(--destructive)]",
  REFUNDED: "bg-[var(--destructive)]",
  PENDING_PAYMENT: "bg-[var(--warning)]",
};

export function AdminOrdersPanel({ orders, products = [], searchFilter, onRefresh }: AdminOrdersPanelProps) {
  const { t, money, date, lang } = useAdmin();
  const productById = useMemo(() => {
    const map = new Map<string, IProduct>();
    for (const p of products) {
      map.set(p.id, p);
      if (p.sku) map.set(`sku:${p.sku}`, p);
    }
    return map;
  }, [products]);
  const productFor = (item: IOrderItem) =>
    productById.get(String(item.productId)) ?? productById.get(`sku:${item.sku}`);
  const imageFor = (item: IOrderItem) => productFor(item)?.imageUrls?.[0];
  const nameFor = (item: IOrderItem) => {
    const p = productFor(item);
    return lang === "ar" && p?.nameAr ? p.nameAr : item.name;
  };
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [inspected, setInspected] = useState<{ order: IOrder; payment: IOrderPaymentInfo | null } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const handleStatusChange = async (orderId: string, nextStatus: string) => {
    setUpdatingId(orderId);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || t("Failed to update order status"));
        return;
      }
      await onRefresh();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleInspect = async (orderId: string) => {
    setActionError(null);
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`);
    const json = await res.json();
    if (res.ok && json.success) setInspected(json.data);
    else setActionError(json.error || t("Failed to fetch order details"));
  };

  const handleRefund = async (orderId: string) => {
    if (!window.confirm(t("Refund this order? This cannot be undone."))) return;
    setUpdatingId(orderId);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Admin dashboard refund" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || t("Unable to refund order"));
        return;
      }
      setInspected(null);
      await onRefresh();
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = orders.filter((o) => {
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerEmail.toLowerCase().includes(q) ||
      o.customerPhone.toLowerCase().includes(q)
    );
  });

  const filterOptions = ["PENDING_PAYMENT", "PAID", ...ORDER_STATUS_OPTIONS, "REFUNDED"];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t("Sales & order fulfilment")}</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="lo-input h-8 text-xs px-2"
        >
          <option value="ALL">
            {t("ALL")} ({orders.length})
          </option>
          {filterOptions.map((st) => (
            <option key={st} value={st}>
              {t(st)} ({counts[st] ?? 0})
            </option>
          ))}
        </select>
      </div>

      {actionError && (
        <div className="p-2.5 rounded border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-xs text-[var(--destructive)]">
          {actionError}
        </div>
      )}

      <div className="lo-card overflow-x-auto">
        <table className="lo-table">
          <thead>
            <tr>
              <th>{t("Order #")}</th>
              <th>{t("Customer")}</th>
              <th>{t("Items")}</th>
              <th>{t("Payment")}</th>
              <th>{t("Total (EGP)")}</th>
              <th>{t("Fulfilment status")}</th>
              <th className="text-right">{t("Inspect")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-xs text-[var(--muted-foreground)]">
                  {t("No orders yet.")}
                </td>
              </tr>
            )}
            {filtered.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-xs text-[var(--foreground)]">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[o.status] ?? "bg-[var(--primary)]"}`} />
                    <span dir="ltr">{o.orderNumber}</span>
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{date(o.createdAt)}</div>
                </td>
                <td>
                  <div className="text-xs font-medium">{o.customerName}</div>
                  <div className="text-[11px] font-mono text-[var(--muted-foreground)]" dir="ltr">
                    {o.customerEmail} · {o.customerPhone}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">{o.shippingAddress?.city}</div>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => handleInspect(o.id)}
                    className="flex items-center -space-x-2 rtl:space-x-reverse"
                    title={o.items.map((i) => `${i.quantity}× ${nameFor(i)}`).join("\n")}
                    aria-label={t("Inspect order & payment")}
                  >
                    {o.items.slice(0, 3).map((item, i) => {
                      const img = imageFor(item);
                      return (
                        <span
                          key={`${item.sku}-${i}`}
                          className="relative h-9 w-9 rounded-md border border-[var(--border)] bg-[var(--muted)] overflow-hidden grid place-items-center"
                        >
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-[10px]">☕</span>
                          )}
                          {item.quantity > 1 && (
                            <span className="absolute bottom-0 end-0 px-1 text-[9px] leading-tight rounded-tl bg-[var(--foreground)] text-[var(--background)]">
                              {item.quantity}
                            </span>
                          )}
                        </span>
                      );
                    })}
                    {o.items.length > 3 && (
                      <span className="h-9 w-9 rounded-md border border-[var(--border)] bg-[var(--card)] grid place-items-center text-[10px]">
                        +{o.items.length - 3}
                      </span>
                    )}
                  </button>
                </td>
                <td className="text-xs">
                  <div>{t(String(o.paymentMethod))}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">{t(String(o.paymentStatus))}</div>
                </td>
                <td className="font-mono text-xs font-semibold">{money(o.totalCents)}</td>
                <td>
                  <select
                    disabled={updatingId === o.id || FINAL_STATUSES.includes(o.status)}
                    value={o.status}
                    onChange={(e) => handleStatusChange(o.id, e.target.value)}
                    className="lo-input h-7 text-xs px-2"
                  >
                    {!ORDER_STATUS_OPTIONS.includes(o.status) && (
                      <option value={o.status} disabled>
                        {t(o.status)}
                      </option>
                    )}
                    {ORDER_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {t(st)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleInspect(o.id)}
                    className="lo-btn lo-btn-ghost h-7 px-2 text-xs"
                    title={t("Inspect order & payment")}
                    aria-label={t("Inspect order & payment")}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  {o.paymentStatus === "SUCCESS" && o.status !== "REFUNDED" && (
                    <button
                      type="button"
                      disabled={updatingId === o.id}
                      onClick={() => handleRefund(o.id)}
                      className="lo-btn lo-btn-ghost h-7 px-2 text-xs text-[var(--destructive)]"
                      title={t("Refund & restore stock")}
                      aria-label={t("Refund & restore stock")}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inspected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setInspected(null)}
        >
          <div className="lo-card w-full max-w-[600px] max-h-[88vh] overflow-y-auto p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="font-mono font-semibold" dir="ltr">
                {inspected.order.orderNumber}
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                className="lo-btn lo-btn-ghost p-1"
                aria-label={t("Close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-[var(--border)] pb-4">
              <div>
                <div className="text-[var(--muted-foreground)]">{t("Customer")}</div>
                <div className="font-medium mt-0.5">{inspected.order.customerName}</div>
                <div className="font-mono text-[11px] text-[var(--muted-foreground)]" dir="ltr">
                  {inspected.order.customerEmail} · {inspected.order.customerPhone}
                </div>
              </div>
              <div>
                <div className="text-[var(--muted-foreground)]">{t("Shipping address")}</div>
                <div className="mt-0.5">
                  {[
                    inspected.order.shippingAddress.street,
                    inspected.order.shippingAddress.building,
                    inspected.order.shippingAddress.floor,
                    inspected.order.shippingAddress.apartment,
                    inspected.order.shippingAddress.city,
                  ]
                    .filter((part) => part && part !== "NA")
                    .join(" · ")}
                </div>
              </div>
            </div>

            {inspected.order.notes && (
              <div className="border-b border-[var(--border)] pb-4">
                <div className="text-[var(--muted-foreground)]">{t("Notes")}</div>
                <p className="mt-1 whitespace-pre-wrap" dir="auto">
                  {inspected.order.notes}
                </p>
              </div>
            )}

            <div className="space-y-1.5 border-b border-[var(--border)] pb-4">
              <div className="text-[var(--muted-foreground)]">{t("Payment record")}</div>
              {inspected.payment ? (
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div>Provider: {inspected.payment.provider}</div>
                  <div>
                    {t("Status")}: {t(inspected.payment.status)}
                  </div>
                  <div>Paymob order: {inspected.payment.paymobOrderId ?? "—"}</div>
                  <div>Transaction: {inspected.payment.paymobTransactionId ?? "—"}</div>
                  <div>HMAC verified: {String(Boolean(inspected.payment.webhookVerified))}</div>
                  <div>{money(inspected.payment.amountCents)}</div>
                </div>
              ) : (
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {t(String(inspected.order.paymentMethod))} · {t(String(inspected.order.paymentStatus))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-[var(--muted-foreground)]">{t("Items")}</div>
              {inspected.order.items.map((item, idx) => {
                const img = imageFor(item);
                return (
                  <div key={idx} className="flex items-center gap-3 text-[11px]">
                    <span className="h-12 w-12 shrink-0 rounded-md bg-[var(--muted)] overflow-hidden grid place-items-center">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span>☕</span>
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-xs truncate">{nameFor(item)}</span>
                      <span className="block font-mono text-[var(--muted-foreground)]">
                        {item.quantity}× · {item.selectedGrind} · {item.sku}
                      </span>
                    </span>
                    <span className="font-mono">{money(item.lineTotalCents)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between pt-2 border-t border-[var(--border)] font-mono font-semibold">
                <span>{t("Total")}</span>
                <span>{money(inspected.order.totalCents)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
