"use client";

import React, { useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { CouponDiscountType, ICoupon } from "@/lib/types";
import { useAdmin } from "@/lib/admin-i18n";

interface AdminCouponsPanelProps {
  coupons: ICoupon[];
  searchFilter: string;
  onRefresh: () => Promise<void>;
}

export function AdminCouponsPanel({
  coupons,
  searchFilter,
  onRefresh,
}: AdminCouponsPanelProps) {
  const { t, money, num, date } = useAdmin();
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] =
    useState<CouponDiscountType>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("15");
  const [minOrderEgp, setMinOrderEgp] = useState("0");
  const [usageLimit, setUsageLimit] = useState("100");
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  });
  const [creating, setCreating] = useState(false);
  const [sendCode, setSendCode] = useState("");
  const [audience, setAudience] = useState("subscribers");
  const [customEmails, setCustomEmails] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendLocale, setSendLocale] = useState<"en" | "ar">("ar");
  const [restrict, setRestrict] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating || !code.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const valueNum =
        discountType === "PERCENTAGE"
          ? Math.round(Number(discountValue))
          : Math.round(Number(discountValue) * 100);

      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discountType,
          discountValue: valueNum,
          minOrderAmountCents: Math.max(
            0,
            Math.round(Number(minOrderEgp || 0) * 100),
          ),
          usageLimit: Math.max(1, Math.round(Number(usageLimit) || 100)),
          startDate: new Date().toISOString(),
          endDate: new Date(`${endDate}T23:59:59.000Z`).toISOString(),
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || t("Failed to create coupon"));
        return;
      }
      setCode("");
      await onRefresh();
    } catch {
      setError(t("Unable to create coupon"));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (coupon: ICoupon) => {
    const id = coupon.id || coupon._id;
    if (!id) return;
    await fetch(`/api/admin/coupons/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
    await onRefresh();
  };

  const handleDelete = async (coupon: ICoupon) => {
    const id = coupon.id || coupon._id;
    if (!id || !window.confirm(t("Delete this coupon?"))) return;
    await fetch(`/api/admin/coupons/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await onRefresh();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = sendCode || coupons.find((c) => c.isActive)?.code || "";
    if (!code || sending) return;
    if (!window.confirm(t("Send this coupon by email now?"))) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/coupons/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          audience,
          emails: customEmails,
          message: sendMessage,
          locale: sendLocale,
          restrict,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSendResult({ ok: false, text: json.error || t("Sending failed") });
        return;
      }
      setSendResult({
        ok: true,
        text: `${t("Sent")}: ${num(json.data.sentCount)} / ${num(json.data.totalTargeted)}`,
      });
    } catch {
      setSendResult({ ok: false, text: t("Sending failed") });
    } finally {
      setSending(false);
    }
  };

  const filtered = coupons.filter((c) =>
    !searchFilter.trim()
      ? true
      : c.code.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="lo-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">{t("Coupons & promotions")}</h2>
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end text-xs"
        >
          <div>
            <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
              {t("Code")} *
            </label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROAST15"
              className="lo-input w-full h-8 text-xs font-mono uppercase"
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
              {t("Type")}
            </label>
            <select
              value={discountType}
              onChange={(e) =>
                setDiscountType(e.target.value as CouponDiscountType)
              }
              className="lo-input w-full h-8 text-xs"
            >
              <option value="PERCENTAGE">{t("PERCENTAGE (%)")}</option>
              <option value="FIXED_AMOUNT">{t("FIXED (EGP)")}</option>
            </select>
          </div>

          <div>
            <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
              {t("Value")} ({discountType === "PERCENTAGE" ? "%" : "EGP"}) *
            </label>
            <input
              type="number"
              required
              min="1"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="lo-input w-full h-8 text-xs font-mono"
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
              {t("Usage limit")}
            </label>
            <input
              type="number"
              min="1"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              className="lo-input w-full h-8 text-xs font-mono"
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-[var(--muted-foreground)] block mb-1">
              {t("Expires")}
            </label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="lo-input w-full h-8 text-xs font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="lo-btn lo-btn-primary h-8 text-xs justify-center"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{creating ? t("Creating…") : t("Create")}</span>
          </button>
        </form>

        <div className="flex items-center gap-4 text-xs">
          <label className="font-mono text-[11px] text-[var(--muted-foreground)]">
            {t("Min order (EGP):")}
          </label>
          <input
            type="number"
            min="0"
            value={minOrderEgp}
            onChange={(e) => setMinOrderEgp(e.target.value)}
            className="lo-input h-7 w-28 text-xs font-mono"
          />
          {error && <span className="text-[var(--destructive)]">{error}</span>}
        </div>
      </div>

      <form onSubmit={handleSend} className="lo-card p-5 space-y-3 text-xs">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Send className="h-4 w-4 text-[var(--primary)]" /> {t("Email a coupon to customers")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--muted-foreground)] block">{t("Coupon")}</span>
            <select
              value={sendCode}
              onChange={(e) => setSendCode(e.target.value)}
              className="lo-input w-full h-8 text-xs font-mono"
            >
              {coupons
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--muted-foreground)] block">{t("Send to")}</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="lo-input w-full h-8 text-xs">
              <option value="subscribers">{t("Newsletter subscribers")}</option>
              <option value="buyers">{t("All past buyers")}</option>
              <option value="repeat">{t("Repeat buyers")}</option>
              <option value="oneTime">{t("One-time buyers")}</option>
              <option value="custom">{t("Custom list")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--muted-foreground)] block">{t("Email language")}</span>
            <select
              value={sendLocale}
              onChange={(e) => setSendLocale(e.target.value === "en" ? "en" : "ar")}
              className="lo-input w-full h-8 text-xs"
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        {audience === "custom" && (
          <textarea
            rows={2}
            dir="ltr"
            value={customEmails}
            onChange={(e) => setCustomEmails(e.target.value)}
            placeholder="ahmed@example.com, sara@example.com"
            className="lo-input w-full p-2 text-xs font-mono"
          />
        )}
        <textarea
          rows={2}
          maxLength={500}
          dir="auto"
          value={sendMessage}
          onChange={(e) => setSendMessage(e.target.value)}
          placeholder={t("Optional message shown above the code")}
          className="lo-input w-full p-2 text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} />
            <span>{t("Only these recipients can use the code")}</span>
          </label>
          <button
            type="submit"
            disabled={sending || coupons.every((c) => !c.isActive)}
            className="lo-btn lo-btn-primary h-8 text-xs"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{sending ? t("Sending…") : t("Send")}</span>
          </button>
        </div>
        {sendResult && (
          <p className={sendResult.ok ? "text-[var(--success)]" : "text-[var(--destructive)]"}>{sendResult.text}</p>
        )}
      </form>

      <div className="lo-card overflow-x-auto">
        <table className="lo-table">
          <thead>
            <tr>
              <th>{t("Code")}</th>
              <th>{t("Discount")}</th>
              <th>{t("Min order")}</th>
              <th>{t("Redemptions")}</th>
              <th>{t("Expires")}</th>
              <th>{t("Status")}</th>
              <th className="text-right">{t("Remove")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const id = c.id || c._id || c.code;
              return (
                <tr key={id}>
                  <td className="font-mono text-xs font-semibold">{c.code}</td>
                  <td className="font-mono text-xs">
                    {c.discountType === "PERCENTAGE"
                      ? `${c.discountValue}%`
                      : money(c.discountValue)}
                  </td>
                  <td className="font-mono text-xs text-[var(--muted-foreground)]">
                    {money(c.minOrderAmountCents)}
                  </td>
                  <td className="font-mono text-xs">
                    {num(c.usedCount)} / {num(c.usageLimit)}
                  </td>
                  <td className="font-mono text-xs text-[var(--muted-foreground)]">
                    {c.endDate ? date(c.endDate) : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(c)}
                      className="lo-badge lo-badge-outline text-[11px] cursor-pointer"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full me-1.5 ${
                          c.isActive ? "bg-[var(--success)]" : "bg-[var(--destructive)]"
                        }`}
                      />
                      {t(c.isActive ? "ACTIVE" : "PAUSED")}
                    </button>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      className="lo-btn lo-btn-ghost h-7 px-2 text-xs text-[var(--destructive)]"
                      aria-label={`${t("Delete")} ${c.code}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
