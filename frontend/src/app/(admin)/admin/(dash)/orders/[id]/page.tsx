"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Copy, FileDown, Mail, MessageCircle, Phone } from "lucide-react";
import {
  Button,
  ErrorLine,
  Field,
  METHOD_LABEL,
  PageTitle,
  Panel,
  PaymentText,
  SkeletonRows,
  StatusBadge,
  StatusLine,
  STATUS_LABEL,
  toCents,
} from "@/components/admin/kit";
import { useIsAdmin } from "@/components/admin/session";
import { useAdmin } from "@/lib/admin-i18n";
import { api, get } from "@/lib/admin/api";
import type { Order, OrderStatus } from "@/lib/admin/types";

const STEPS: OrderStatus[] = ["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"];
const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Mark as Confirmed",
  PREPARING: "Mark as Preparing",
  SHIPPED: "Mark as On the way",
  DELIVERED: "Mark as Delivered",
  CANCELLED: "Cancel order",
};

function whatsapp(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("01") && d.length === 11) d = `2${d}`;
  return `https://wa.me/${d}`;
}

function CopyButton({ value }: { value: string }) {
  const { t } = useAdmin();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="adm-icon-btn !h-7 !w-7"
      aria-label={done ? t("Copied") : t("Copy")}
      onClick={() => navigator.clipboard.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
    >
      <Copy size={12} />
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 ${strong ? "border-t border-[var(--border)] pt-3 text-base font-bold" : "text-sm"}`}>
      <span className={strong ? "" : "text-[var(--muted-foreground)]"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, money, date, lang, dir } = useAdmin();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [line, setLine] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [restock, setRestock] = useState(true);

  const order = useQuery({ queryKey: ["admin", "orders", "detail", id], queryFn: () => get<Order>(`orders/${id}`) });
  const refresh = (o: Order) => {
    qc.setQueryData(["admin", "orders", "detail", id], o);
    qc.invalidateQueries({ queryKey: ["admin", "orders"], exact: false });
    qc.invalidateQueries({ queryKey: ["admin", "queue"] });
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
  const move = useMutation({
    mutationFn: (status: OrderStatus) => api<Order>(`orders/${id}/status`, { method: "PATCH", body: { status, note: note.trim() || undefined } }),
    onSuccess: (r, status) => {
      refresh(r.data);
      setNote("");
      setLine({ msg: t("Order {n} is now {s}.", { n: r.data.orderNumber, s: t(STATUS_LABEL[status]) }), tone: "ok" });
    },
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });
  const refund = useMutation({
    mutationFn: () => {
      const cents = amount.trim() ? toCents(amount) : undefined;
      if (cents !== undefined && (cents === null || Number.isNaN(cents) || cents <= 0)) throw new Error("Enter a valid amount");
      return api<Order>(`orders/${id}/refund`, { method: "PATCH", body: { reason, amountPiasters: cents ?? undefined, restock } });
    },
    onSuccess: (r) => {
      refresh(r.data);
      setRefundOpen(false);
      setReason("");
      setAmount("");
      setLine({ msg: t("Refund recorded."), tone: "ok" });
    },
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });

  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  if (order.isPending) return <SkeletonRows rows={8} />;
  if (order.error || !order.data) return <ErrorLine error={order.error ?? "This order no longer exists"} />;
  const o = order.data;
  const reached = (s: OrderStatus) => o.history?.find((h) => h.toStatus === s);
  const closed = !o.nextStatuses?.length;
  const a = o.shippingAddress;

  return (
    <>
      <Link href="/admin/orders" className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:underline">
        <Back size={14} /> {t("All orders")}
      </Link>
      <PageTitle
        title={o.orderNumber}
        eyebrow={t("Placed {d}", { d: date(o.createdAt) })}
        aside={
          <>
            <StatusBadge status={o.status} />
            <a className="adm-btn" href={`/api/admin/v1/orders/${o.id}/invoice`} target="_blank" rel="noopener">
              <FileDown size={15} /> {t("Invoice PDF")}
            </a>
          </>
        }
      />

      <Panel className="mb-4">
        {o.status === "CANCELLED" || o.status === "REFUNDED" ? (
          <p className="text-sm">
            {o.status === "CANCELLED" ? t("This order was cancelled.") : t("This order was refunded.")}{" "}
            {o.cancelReason || o.refundReason ? <span className="text-[var(--muted-foreground)]">({o.cancelReason || o.refundReason})</span> : null}
          </p>
        ) : (
          <ol className="adm-steps">
            {STEPS.map((s) => {
              const h = reached(s);
              return (
                <li key={s} className="adm-step" data-done={h || STEPS.indexOf(s) <= STEPS.indexOf(o.status) ? "" : undefined}>
                  <strong>{t(STATUS_LABEL[s])}</strong>
                  <span>{h ? date(h.createdAt) : "—"}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Panel title={t("Pieces")}>
            <ul className="adm-list">
              {o.items.map((i) => (
                <li key={i.id} className="adm-row">
                  {i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageUrl} alt="" className="adm-thumb" />
                  ) : (
                    <span className="adm-thumb" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{(lang === "ar" && i.nameAr) || i.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {[(lang === "ar" && i.variantLabelAr) || i.variantLabel, i.sku].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-[var(--muted-foreground)]">
                    {i.quantity} × {money(i.unitPriceCents)}
                  </span>
                  <span className="w-24 text-end font-semibold tabular-nums">{money(i.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 ms-auto max-w-sm">
              <Row label={t("Subtotal")} value={money(o.subTotalCents)} />
              {o.discountCents ? <Row label={`${t("Discount")}${o.couponCode ? ` (${o.couponCode})` : ""}`} value={money(-o.discountCents)} /> : null}
              <Row label={t("Delivery")} value={money(o.shippingFeeCents)} />
              {o.giftCardCents ? <Row label={t("Gift card")} value={money(-o.giftCardCents)} /> : null}
              {o.loyaltyCents ? <Row label={t("Loyalty points")} value={money(-o.loyaltyCents)} /> : null}
              <Row label={t("Total")} value={money(o.totalCents)} strong />
              {o.refundedCents ? <Row label={t("Refunded")} value={money(-o.refundedCents)} /> : null}
            </div>
          </Panel>

          <Panel title={t("Update the order")}>
            {closed ? (
              <p className="text-sm text-[var(--muted-foreground)]">{t("This order is closed. Nothing else to do.")}</p>
            ) : (
              <div className="grid gap-3">
                <Field label={t("Note for the timeline (optional)")}>
                  {(fid) => <input id={fid} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
                </Field>
                <div className="flex flex-wrap gap-2">
                  {o.nextStatuses?.map((s) => (
                    <Button
                      key={s}
                      variant={s === "CANCELLED" ? "danger" : "primary"}
                      pending={move.isPending && move.variables === s}
                      disabled={move.isPending}
                      onClick={() => {
                        if (s === "CANCELLED" && !window.confirm(t("Cancel this order? Cancelling returns the pieces to stock."))) return;
                        move.mutate(s);
                      }}
                    >
                      {t(ACTION_LABEL[s] ?? s)}
                    </Button>
                  ))}
                </div>
                {o.nextStatuses?.includes("CANCELLED") ? (
                  <p className="text-xs text-[var(--muted-foreground)]">{t("Cancelling returns the pieces to stock.")}</p>
                ) : null}
              </div>
            )}
            <StatusLine message={line?.msg} tone={line?.tone} />

            {isAdmin && o.canRefund ? (
              <details className="mt-3 rounded-2xl border border-[var(--border)] p-4" open={refundOpen} onToggle={(e) => setRefundOpen((e.target as HTMLDetailsElement).open)}>
                <summary className="cursor-pointer text-sm font-semibold">{t("Refund")}</summary>
                <form
                  className="mt-3 grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    refund.mutate();
                  }}
                >
                  <Field label={t("Reason (kept on the order)")}>
                    {(fid) => <input id={fid} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
                  </Field>
                  <Field
                    label={t("Amount in EGP")}
                    hint={t("Leave empty to refund the rest ({m}).", { m: money(o.totalCents - (o.refundedCents ?? 0)) })}
                  >
                    {(fid, d) => <input id={fid} aria-describedby={d} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> {t("Return the pieces to stock")}
                  </label>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {o.paymentMethod === "CASH_ON_DELIVERY"
                      ? t("Cash refunds are only recorded here. Hand the money back yourself.")
                      : t("The money goes back through Paymob to the customer's card or wallet.")}
                  </p>
                  <div>
                    <Button variant="danger" type="submit" pending={refund.isPending}>
                      {t("Refund")}
                    </Button>
                  </div>
                </form>
              </details>
            ) : null}
          </Panel>

          <Panel title={t("Timeline")}>
            <ol className="grid gap-3">
              {[...(o.history ?? [])].reverse().map((h) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[var(--primary)]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p>
                      <StatusBadge status={h.toStatus} />{" "}
                      <span className="text-[var(--muted-foreground)]">
                        {date(h.createdAt)} · {h.by ? t("by {name}", { name: h.by.fullName }) : t("automatic")}
                      </span>
                    </p>
                    {h.note ? <p className="mt-1 break-words">{h.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel title={t("Customer")}>
            <p className="font-semibold">{o.customerName}</p>
            <p className="mb-3 text-xs text-[var(--muted-foreground)]">{o.hasAccount ? t("Has an account") : t("Guest checkout")}</p>
            <div className="grid gap-2 text-sm">
              <span className="flex items-center justify-between gap-2">
                <a href={`mailto:${o.customerEmail}`} className="truncate hover:underline">
                  {o.customerEmail}
                </a>
                <CopyButton value={o.customerEmail} />
              </span>
              <span className="flex items-center justify-between gap-2">
                <a href={`tel:${o.customerPhone}`} className="hover:underline" dir="ltr">
                  {o.customerPhone}
                </a>
                <CopyButton value={o.customerPhone} />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="adm-btn" href={`mailto:${o.customerEmail}?subject=${encodeURIComponent(o.orderNumber)}`}>
                <Mail size={14} /> {t("Email")}
              </a>
              <a className="adm-btn" href={`tel:${o.customerPhone}`}>
                <Phone size={14} /> {t("Call")}
              </a>
              <a className="adm-btn" href={whatsapp(o.customerPhone)} target="_blank" rel="noopener">
                <MessageCircle size={14} /> WhatsApp
              </a>
            </div>
            <Link href={`/admin/customers/${encodeURIComponent(o.userId || o.customerEmail)}`} className="mt-3 inline-block text-sm hover:underline">
              {t("Customer page →")}
            </Link>
          </Panel>

          <Panel title={t("Delivery address")}>
            <p className="text-sm leading-relaxed">
              {[a.governorate, a.city].filter(Boolean).join(" · ")}
              <br />
              {a.street}
              <br />
              {[
                a.building && a.building !== "NA" ? `${t("Building")} ${a.building}` : "",
                a.floor && a.floor !== "NA" ? `${t("Floor")} ${a.floor}` : "",
                a.apartment && a.apartment !== "NA" ? `${t("Apt")} ${a.apartment}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {o.notes ? (
              <p className="mt-3 rounded-xl bg-[var(--muted)] p-3 text-sm">
                <strong className="block text-xs text-[var(--muted-foreground)]">{t("Customer notes")}</strong>
                {o.notes}
              </p>
            ) : null}
          </Panel>

          <Panel title={t("Payment")}>
            <p className="text-sm">
              {t(METHOD_LABEL[o.paymentMethod])} · <PaymentText status={o.paymentStatus} />
            </p>
            {o.payments?.length ? (
              <ul className="adm-list mt-3">
                {o.payments.map((p) => (
                  <li key={p.id} className="py-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span>
                        {p.provider} · <PaymentText status={p.status} />
                      </span>
                      <span className="tabular-nums">{money(p.amountCents)}</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {date(p.createdAt)}
                      {p.refundedCents ? ` · ${t("Refunded")} ${money(p.refundedCents)}` : ""}
                      {p.failureReason ? ` · ${p.failureReason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </div>
      </div>
    </>
  );
}
