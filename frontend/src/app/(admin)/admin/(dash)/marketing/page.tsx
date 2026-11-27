"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button, Empty, ErrorLine, Field, PageTitle, Panel, Segmented, SkeletonRows, StatusLine, toCents, Toggle, toEgp } from "@/components/admin/kit";
import { AdminSubscribersPanel } from "@/components/admin/AdminSubscribersPanel";
import { useIsAdmin } from "@/components/admin/session";
import { useAdmin } from "@/lib/admin-i18n";
import { api, get, getPage } from "@/lib/admin/api";
import type { Coupon, GiftCard, SettingRow } from "@/lib/admin/types";

type Line = { msg: string; tone: "ok" | "error" } | null;
const isoDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 16) : "");
const STATE_TONE: Record<Coupon["state"], string | undefined> = { ACTIVE: "green", SCHEDULED: "brand", EXPIRED: undefined, OFF: undefined, USED_UP: "amber" };
const STATE_LABEL: Record<Coupon["state"], string> = { ACTIVE: "Active", SCHEDULED: "Scheduled", EXPIRED: "Expired", OFF: "Off", USED_UP: "Used up" };

// ---------------------------------------------------------------- Coupons

type CouponDraft = {
  id?: string;
  code: string;
  note: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  value: string;
  min: string;
  max: string;
  usageLimit: string;
  perCustomer: string;
  start: string;
  end: string;
  isActive: boolean;
};

function newCoupon(): CouponDraft {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86400000);
  return { code: "", note: "", discountType: "PERCENTAGE", value: "10", min: "", max: "", usageLimit: "", perCustomer: "1", start: isoDate(now.toISOString()), end: isoDate(end.toISOString()), isActive: true };
}

function CouponForm({ draft, onDone }: { draft: CouponDraft; onDone: (msg: string) => void }) {
  const { t } = useAdmin();
  const qc = useQueryClient();
  const [d, setD] = useState(draft);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof CouponDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const code = d.code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("Use 3 to 32 letters, numbers, - or _");
      const value = d.discountType === "PERCENTAGE" ? Number(d.value) : toCents(d.value);
      if (!value || Number.isNaN(value) || value <= 0) throw new Error("Enter the discount value");
      const int = (s: string) => (s.trim() ? Number(s) : null);
      const body = {
        code,
        note: d.note,
        discountType: d.discountType,
        discountValue: value,
        minOrderAmountCents: toCents(d.min) ?? 0,
        maxDiscountAmountCents: toCents(d.max),
        usageLimit: int(d.usageLimit),
        perCustomerLimit: int(d.perCustomer),
        startDate: new Date(d.start).toISOString(),
        endDate: new Date(d.end).toISOString(),
        isActive: d.isActive,
      };
      return d.id ? api(`coupons/${d.id}`, { method: "PATCH", body }) : api("coupons", { method: "POST", body });
    },
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["admin", "coupons"] }), onDone(t("Coupon saved."))),
    onError: (e) => setErr((e as Error).message),
  });
  return (
    <form
      className="mb-4 grid gap-3 rounded-2xl border border-[var(--border)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("Code")} hint={t("3–32 characters: A-Z, 0-9, - and _")}>{(id, h) => <input id={id} aria-describedby={h} value={d.code} onChange={set("code")} className="uppercase" />}</Field>
        <Field label={t("Team note")}>{(id) => <input id={id} value={d.note} onChange={set("note")} />}</Field>
        <Field label={t("Type")}>
          {(id) => (
            <select id={id} value={d.discountType} onChange={set("discountType")}>
              <option value="PERCENTAGE">{t("Percentage")}</option>
              <option value="FIXED_AMOUNT">{t("Fixed amount (EGP)")}</option>
            </select>
          )}
        </Field>
        <Field label={d.discountType === "PERCENTAGE" ? t("Value (%)") : t("Value (EGP)")}>{(id) => <input id={id} inputMode="decimal" value={d.value} onChange={set("value")} />}</Field>
        <Field label={t("Minimum order (EGP)")}>{(id) => <input id={id} inputMode="decimal" value={d.min} onChange={set("min")} />}</Field>
        <Field label={t("Maximum discount (EGP)")} hint={t("Empty = no cap")}>{(id, h) => <input id={id} aria-describedby={h} inputMode="decimal" value={d.max} onChange={set("max")} />}</Field>
        <Field label={t("Total uses")} hint={t("Empty = unlimited")}>{(id, h) => <input id={id} aria-describedby={h} inputMode="numeric" value={d.usageLimit} onChange={set("usageLimit")} />}</Field>
        <Field label={t("Uses per customer")} hint={t("Empty = unlimited")}>{(id, h) => <input id={id} aria-describedby={h} inputMode="numeric" value={d.perCustomer} onChange={set("perCustomer")} />}</Field>
        <div />
        <Field label={t("Starts")}>{(id) => <input id={id} type="datetime-local" value={d.start} onChange={set("start")} />}</Field>
        <Field label={t("Ends")}>{(id) => <input id={id} type="datetime-local" value={d.end} onChange={set("end")} />}</Field>
      </div>
      <Toggle label={t("Active")} checked={d.isActive} onChange={(c) => setD({ ...d, isActive: c })} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" pending={save.isPending}>{d.id ? t("Save") : t("Create")}</Button>
        <Button onClick={() => onDone("")}>{t("Cancel")}</Button>
      </div>
      {err ? <ErrorLine error={err} /> : null}
    </form>
  );
}

function SendCoupon({ code, onDone }: { code: string; onDone: (msg: string) => void }) {
  const { t, lang } = useAdmin();
  const [audience, setAudience] = useState<"buyers" | "subscribers" | "list">("buyers");
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () =>
      api<{ queued: number }>("coupons/send-to-buyers", {
        method: "POST",
        body: {
          code,
          audience,
          emails: audience === "list" ? emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean) : undefined,
          customMessage: message || undefined,
          locale: lang,
        },
      }),
    onSuccess: (r) => onDone(t("Queued for {n} people", { n: r.data.queued })),
    onError: (e) => setErr((e as Error).message),
  });
  return (
    <div className="mt-2 grid gap-3 rounded-2xl border border-[var(--border)] p-4">
      <Segmented
        label={t("Send to")}
        value={audience}
        onChange={setAudience}
        options={[
          { value: "buyers", label: t("Everyone who has ordered") },
          { value: "subscribers", label: t("Newsletter subscribers") },
          { value: "list", label: t("A list of emails") },
        ]}
      />
      {audience === "list" ? (
        <Field label={t("Emails (one per line or comma separated)")}>{(id) => <textarea id={id} value={emails} onChange={(e) => setEmails(e.target.value)} />}</Field>
      ) : null}
      <Field label={t("Message (optional)")}>{(id) => <input id={id} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />}</Field>
      <div className="flex gap-2">
        <Button variant="primary" pending={send.isPending} onClick={() => send.mutate()}>
          <Send size={14} /> {t("Send")}
        </Button>
        <Button onClick={() => onDone("")}>{t("Cancel")}</Button>
      </div>
      {err ? <ErrorLine error={err} /> : null}
    </div>
  );
}

function Coupons() {
  const { t, money, dateOnly } = useAdmin();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CouponDraft | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [line, setLine] = useState<Line>(null);
  const list = useQuery({ queryKey: ["admin", "coupons"], queryFn: () => getPage<Coupon>("coupons", { limit: 100 }) });
  const remove = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`coupons/${id}`, { method: "DELETE" }),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ["admin", "coupons"] }), setLine({ msg: t(r.data.message), tone: "ok" })),
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });
  const done = (msg: string) => {
    setEditing(null);
    setSending(null);
    if (msg) setLine({ msg, tone: "ok" });
  };
  const docs = list.data?.data ?? [];
  return (
    <Panel
      title={t("Coupons")}
      action={!editing ? <Button onClick={() => setEditing(newCoupon())}><Plus size={14} /> {t("New coupon")}</Button> : null}
    >
      {editing && !editing.id ? <CouponForm draft={editing} onDone={done} /> : null}
      <ErrorLine error={list.error} />
      {list.isPending ? (
        <SkeletonRows rows={4} />
      ) : docs.length === 0 ? (
        <Empty>{t("No coupons yet.")}</Empty>
      ) : (
        <ul className="adm-list">
          {docs.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="adm-mono font-semibold">{c.code}</span>
                    <span className="adm-chip" data-tone={STATE_TONE[c.state]}>{t(STATE_LABEL[c.state])}</span>
                    {c.source === "WHEEL" ? <span className="adm-chip">{t("Prize wheel")}</span> : null}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : money(c.discountValue)} ·{" "}
                    {c.usageLimit ? t("{u} of {l} used", { u: c.usedCount, l: c.usageLimit }) : t("{u} used", { u: c.usedCount })} · {dateOnly(c.startDate)} → {dateOnly(c.endDate)}
                    {c.note ? ` · ${c.note}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button onClick={() => (setSending(sending === c.code ? null : c.code), setEditing(null))}><Send size={14} /> {t("Send by email")}</Button>
                  <button
                    type="button"
                    className="adm-icon-btn"
                    aria-label={t("Edit")}
                    onClick={() =>
                      setEditing({
                        id: c.id,
                        code: c.code,
                        note: c.note ?? "",
                        discountType: c.discountType,
                        value: c.discountType === "PERCENTAGE" ? String(c.discountValue) : toEgp(c.discountValue),
                        min: c.minOrderAmountCents ? toEgp(c.minOrderAmountCents) : "",
                        max: toEgp(c.maxDiscountAmountCents),
                        usageLimit: c.usageLimit ? String(c.usageLimit) : "",
                        perCustomer: c.perCustomerLimit ? String(c.perCustomerLimit) : "",
                        start: isoDate(c.startDate),
                        end: isoDate(c.endDate),
                        isActive: c.isActive,
                      })
                    }
                  >
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="adm-icon-btn" aria-label={t("Delete")} onClick={() => window.confirm(t("Delete {code}?", { code: c.code })) && remove.mutate(c.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {editing?.id === c.id ? <div className="mt-3"><CouponForm draft={editing} onDone={done} /></div> : null}
              {sending === c.code ? <SendCoupon code={c.code} onDone={done} /> : null}
            </li>
          ))}
        </ul>
      )}
      <StatusLine message={line?.msg} tone={line?.tone} />
    </Panel>
  );
}

// ---------------------------------------------------------------- Gift cards

function GiftCards() {
  const { t, money, dateOnly, lang } = useAdmin();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState({ amount: "500", email: "", message: "", expires: "" });
  const [line, setLine] = useState<Line>(null);
  const list = useQuery({ queryKey: ["admin", "giftcards"], queryFn: () => getPage<GiftCard>("admin/gift-cards", { limit: 50 }) });
  const issue = useMutation({
    mutationFn: () => {
      const cents = toCents(g.amount);
      if (!cents || Number.isNaN(cents) || cents < 5000 || cents > 1000000) throw new Error("A gift card is between 50 and 10,000 EGP");
      return api<GiftCard>("admin/gift-cards", {
        method: "POST",
        body: { amountCents: cents, recipientEmail: g.email || undefined, message: g.message || undefined, expiresAt: g.expires ? new Date(g.expires).toISOString() : undefined, locale: lang },
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "giftcards"] });
      setOpen(false);
      setG({ amount: "500", email: "", message: "", expires: "" });
      setLine({ msg: t("Gift card {code} issued.", { code: r.data.code ?? "" }), tone: "ok" });
    },
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`admin/gift-cards/${id}`, { method: "PATCH", body: { active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "giftcards"] }),
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });
  const docs = list.data?.data ?? [];
  return (
    <Panel title={t("Gift cards")} action={!open ? <Button onClick={() => setOpen(true)}><Plus size={14} /> {t("Issue a gift card")}</Button> : null}>
      {open ? (
        <form
          className="mb-4 grid gap-3 rounded-2xl border border-[var(--border)] p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            issue.mutate();
          }}
        >
          <Field label={t("Amount (EGP)")} hint={t("50 to 10,000 EGP")}>{(id, h) => <input id={id} aria-describedby={h} inputMode="decimal" value={g.amount} onChange={(e) => setG({ ...g, amount: e.target.value })} />}</Field>
          <Field label={t("Recipient email")} hint={t("We email them the code.")}>{(id, h) => <input id={id} aria-describedby={h} type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />}</Field>
          <Field label={t("Message")}>{(id) => <input id={id} maxLength={500} value={g.message} onChange={(e) => setG({ ...g, message: e.target.value })} />}</Field>
          <Field label={t("Expires")}>{(id) => <input id={id} type="date" value={g.expires} onChange={(e) => setG({ ...g, expires: e.target.value })} />}</Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" pending={issue.isPending}>{t("Issue")}</Button>
            <Button onClick={() => setOpen(false)}>{t("Cancel")}</Button>
          </div>
        </form>
      ) : null}
      <ErrorLine error={list.error} />
      {list.isPending ? (
        <SkeletonRows rows={3} />
      ) : docs.length === 0 ? (
        <Empty>{t("No gift cards yet.")}</Empty>
      ) : (
        <ul className="adm-list">
          {docs.map((c) => (
            <li key={c.id} className="adm-row flex-wrap justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="adm-mono font-semibold">{c.code ?? t("Waiting for payment")}</span>
                  <span className="adm-chip">{c.source === "ISSUED" ? t("Issued here") : t("Bought")}</span>
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t("{b} of {i}", { b: money(c.balanceCents), i: money(c.initialCents) })}
                  {c.recipientEmail ? ` · ${c.recipientEmail}` : ""}
                  {c.expiresAt ? ` · ${t("until {d}", { d: dateOnly(c.expiresAt) })}` : ""}
                </p>
              </div>
              {c.status !== "PENDING_PAYMENT" ? (
                <Toggle label={c.status === "ACTIVE" ? t("On") : t("Off")} checked={c.status === "ACTIVE"} onChange={(active) => toggle.mutate({ id: c.id, active })} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <StatusLine message={line?.msg} tone={line?.tone} />
    </Panel>
  );
}

// ---------------------------------------------------------------- Marquee & wheel (stored as settings)

type Marquee = { enabled: boolean; lines: Array<{ en: string; ar: string }> };
type Slice = { labelEn: string; labelAr: string; prize: "none" | "percent" | "amount"; value: number; weight: number };
type Wheel = {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  popupDelaySeconds: number;
  codeValidityDays: number;
  minOrderCents: number;
  slices: Slice[];
  chosenWinners: Array<{ email: string; sliceIndex: number }>;
  round: number;
};

function useSetting<T>(key: string) {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["admin", "settings"], queryFn: () => get<SettingRow[]>("admin/settings") });
  const value = rows.data?.find((r) => r.key === key)?.value as T | undefined;
  const save = useMutation({
    mutationFn: (v: T) => api("admin/settings", { method: "PATCH", body: { values: { [key]: v } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });
  return { value, save, loading: rows.isPending, error: rows.error };
}

function MarqueeEditor({ settingKey, title }: { settingKey: string; title: string }) {
  const { t } = useAdmin();
  const { value, save, loading } = useSetting<Marquee>(settingKey);
  const [m, setM] = useState<Marquee | null>(null);
  const [line, setLine] = useState<Line>(null);
  useEffect(() => {
    if (value) setM(value);
  }, [value]);
  if (loading || !m) return <Panel title={title}><SkeletonRows rows={2} /></Panel>;
  return (
    <Panel title={title} action={<Toggle label={t("Show")} checked={m.enabled} onChange={(c) => setM({ ...m, enabled: c })} />}>
      <ul className="grid gap-2">
        {m.lines.map((l, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className="adm-input" aria-label={t("English line {n}", { n: i + 1 })} value={l.en} onChange={(e) => setM({ ...m, lines: m.lines.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)) })} />
            <input className="adm-input" dir="rtl" aria-label={t("Arabic line {n}", { n: i + 1 })} value={l.ar} onChange={(e) => setM({ ...m, lines: m.lines.map((x, j) => (j === i ? { ...x, ar: e.target.value } : x)) })} />
            <button type="button" className="adm-icon-btn" aria-label={t("Remove line")} onClick={() => setM({ ...m, lines: m.lines.filter((_, j) => j !== i) })}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => setM({ ...m, lines: [...m.lines, { en: "", ar: "" }] })}><Plus size={14} /> {t("Add line")}</Button>
        <Button
          variant="primary"
          pending={save.isPending}
          onClick={() => save.mutate(m, { onSuccess: () => setLine({ msg: t("Saved."), tone: "ok" }), onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }) })}
        >
          {t("Save")}
        </Button>
      </div>
      <StatusLine message={line?.msg} tone={line?.tone} />
    </Panel>
  );
}

function WheelEditor() {
  const { t } = useAdmin();
  const { value, save, loading } = useSetting<Wheel>("wheel");
  const [w, setW] = useState<Wheel | null>(null);
  const [winner, setWinner] = useState({ email: "", slice: "0" });
  const [line, setLine] = useState<Line>(null);
  useEffect(() => {
    if (value) setW(value);
  }, [value]);
  if (loading || !w) return <Panel title={t("Prize wheel")}><SkeletonRows rows={4} /></Panel>;
  const totalWeight = w.slices.reduce((s, x) => s + Math.max(0, Number(x.weight) || 0), 0);
  const setSlice = (i: number, patch: Partial<Slice>) => setW({ ...w, slices: w.slices.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const persist = (next: Wheel, msg: string) =>
    save.mutate(next, { onSuccess: () => setLine({ msg, tone: "ok" }), onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }) });

  return (
    <Panel title={t("Prize wheel")} action={<Toggle label={t("On")} checked={w.enabled} onChange={(c) => setW({ ...w, enabled: c })} />}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("Starts")}>{(id) => <input id={id} type="datetime-local" value={isoDate(w.startsAt)} onChange={(e) => setW({ ...w, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />}</Field>
        <Field label={t("Ends")}>{(id) => <input id={id} type="datetime-local" value={isoDate(w.endsAt)} onChange={(e) => setW({ ...w, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />}</Field>
        <Field label={t("Pop-up delay (seconds)")}>{(id) => <input id={id} inputMode="numeric" value={w.popupDelaySeconds} onChange={(e) => setW({ ...w, popupDelaySeconds: Number(e.target.value) || 0 })} />}</Field>
        <Field label={t("Code valid for (days)")}>{(id) => <input id={id} inputMode="numeric" value={w.codeValidityDays} onChange={(e) => setW({ ...w, codeValidityDays: Number(e.target.value) || 1 })} />}</Field>
        <Field label={t("Minimum order for won codes (EGP)")}>{(id) => <input id={id} inputMode="decimal" value={toEgp(w.minOrderCents)} onChange={(e) => setW({ ...w, minOrderCents: toCents(e.target.value) ?? 0 })} />}</Field>
        <div className="text-sm text-[var(--muted-foreground)] sm:self-end">{t("Round {n}", { n: w.round })}</div>
      </div>

      <h3 className="mt-5 mb-2 text-sm font-semibold">{t("Slices")}</h3>
      <ul className="grid gap-2">
        {w.slices.map((s, i) => (
          <li key={i} className="grid gap-2 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_1fr_8rem_6rem_5rem_auto_auto] sm:items-center">
            <input className="adm-input" aria-label={t("Label (English)")} value={s.labelEn} onChange={(e) => setSlice(i, { labelEn: e.target.value })} />
            <input className="adm-input" dir="rtl" aria-label={t("Label (Arabic)")} value={s.labelAr} onChange={(e) => setSlice(i, { labelAr: e.target.value })} />
            <select className="adm-input" aria-label={t("Prize")} value={s.prize} onChange={(e) => setSlice(i, { prize: e.target.value as Slice["prize"] })}>
              <option value="none">{t("No prize")}</option>
              <option value="percent">{t("% off")}</option>
              <option value="amount">{t("EGP off")}</option>
            </select>
            <input
              className="adm-input"
              inputMode="decimal"
              aria-label={t("Value")}
              disabled={s.prize === "none"}
              value={s.prize === "amount" ? toEgp(s.value) : String(s.value)}
              onChange={(e) => setSlice(i, { value: s.prize === "amount" ? toCents(e.target.value) ?? 0 : Number(e.target.value) || 0 })}
            />
            <input className="adm-input" inputMode="numeric" aria-label={t("Weight")} value={s.weight} onChange={(e) => setSlice(i, { weight: Number(e.target.value) || 0 })} />
            <span className="text-xs tabular-nums text-[var(--muted-foreground)]">{totalWeight ? `${Math.round((Math.max(0, s.weight) / totalWeight) * 100)}%` : "—"}</span>
            <button type="button" className="adm-icon-btn" aria-label={t("Remove slice")} disabled={w.slices.length <= 2} onClick={() => setW({ ...w, slices: w.slices.filter((_, j) => j !== i) })}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <Button className="mt-2" disabled={w.slices.length >= 12} onClick={() => setW({ ...w, slices: [...w.slices, { labelEn: "", labelAr: "", prize: "none", value: 0, weight: 10 }] })}>
        <Plus size={14} /> {t("Add slice")}
      </Button>

      <h3 className="mt-5 mb-2 text-sm font-semibold">{t("Chosen winners")}</h3>
      <p className="mb-2 text-xs text-[var(--muted-foreground)]">{t("An email in this list always lands on the slice you pick.")}</p>
      <ul className="grid gap-1 text-sm">
        {w.chosenWinners.map((cw, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span>{cw.email} → {w.slices[cw.sliceIndex]?.labelEn ?? cw.sliceIndex + 1}</span>
            <button type="button" className="adm-icon-btn !h-7 !w-7" aria-label={t("Remove")} onClick={() => setW({ ...w, chosenWinners: w.chosenWinners.filter((_, j) => j !== i) })}>
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
        <input className="adm-input" type="email" aria-label={t("Email")} placeholder="name@example.com" value={winner.email} onChange={(e) => setWinner({ ...winner, email: e.target.value })} />
        <select className="adm-input" aria-label={t("Slice")} value={winner.slice} onChange={(e) => setWinner({ ...winner, slice: e.target.value })}>
          {w.slices.map((s, i) => (
            <option key={i} value={i}>{s.labelEn || `#${i + 1}`}</option>
          ))}
        </select>
        <Button
          onClick={() => {
            if (!winner.email.includes("@")) return;
            setW({ ...w, chosenWinners: [...w.chosenWinners, { email: winner.email.trim().toLowerCase(), sliceIndex: Number(winner.slice) }] });
            setWinner({ email: "", slice: "0" });
          }}
        >
          {t("Add")}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" pending={save.isPending} onClick={() => persist(w, t("Saved."))}>{t("Save")}</Button>
        <Button
          onClick={() =>
            window.confirm(t("Start a new round? Everyone can spin again; codes already won stay valid.")) &&
            persist({ ...w, round: w.round + 1 }, t("Round {n} started.", { n: w.round + 1 }))
          }
        >
          {t("Start a new round")}
        </Button>
      </div>
      <StatusLine message={line?.msg} tone={line?.tone} />
    </Panel>
  );
}

export default function MarketingPage() {
  const { t } = useAdmin();
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <>
        <PageTitle title={t("Marketing")} />
        <Panel>
          <Empty>{t("Only admins can manage marketing.")}</Empty>
        </Panel>
      </>
    );
  }
  return (
    <>
      <PageTitle title={t("Marketing")} />
      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <Coupons />
          <GiftCards />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <MarqueeEditor settingKey="marquee.top" title={t("Scrolling text above the menu")} />
          <MarqueeEditor settingKey="marquee.band" title={t("Scrolling band after the home-page pieces")} />
        </div>
        <WheelEditor />
        <Panel title={t("Newsletter subscribers")}>
          <AdminSubscribersPanel searchFilter="" />
        </Panel>
      </div>
    </>
  );
}
