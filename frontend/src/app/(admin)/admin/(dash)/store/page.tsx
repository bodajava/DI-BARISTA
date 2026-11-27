"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, ErrorLine, Field, PageTitle, Panel, SkeletonRows, StatusLine, toCents, Toggle, toEgp } from "@/components/admin/kit";
import { useIsAdmin } from "@/components/admin/session";
import { useAdmin } from "@/lib/admin-i18n";
import { api, get } from "@/lib/admin/api";
import type { SettingRow, Zone } from "@/lib/admin/types";

/** Settings shown on this page (the marquee and prize wheel are edited under Marketing) */
const FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "store.name", label: "Store name" },
  { key: "contact.email", label: "Contact email", hint: "Shown in the footer and contact page; contact messages are sent here." },
  { key: "contact.phone", label: "Phone" },
  { key: "contact.whatsapp", label: "WhatsApp number", hint: "With the country code, e.g. +201…" },
  { key: "social.instagram", label: "Instagram link" },
  { key: "contact.backupEmail", label: "Backup email for contact messages" },
  { key: "orders.inboxEmail", label: "Orders inbox email", hint: "Gets a full copy of every new order with a printable PDF." },
  { key: "currency", label: "Currency" },
  { key: "shipping.freeThresholdCents", label: "Free delivery from (EGP)", hint: "0 = never free" },
  { key: "reviews.autoPublish", label: "Publish reviews without moderation" },
  { key: "loyalty.pointValueCents", label: "Value of one loyalty point (EGP)" },
  { key: "loyalty.spendPerPointCents", label: "Spend per loyalty point (EGP)", hint: "A customer earns one point for every this much spent on delivered orders." },
  { key: "referral.bonusPoints", label: "Referral bonus points" },
  { key: "cart.abandonedReminderHours", label: "Abandoned-cart reminder after (hours)" },
  { key: "orders.unpaidExpiryMinutes", label: "Cancel unpaid online orders after (minutes)" },
  { key: "giftCards.unpaidExpiryMinutes", label: "Cancel unpaid gift cards after (minutes)" },
];

function Zones() {
  const { t, lang, money } = useAdmin();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const zones = useQuery({ queryKey: ["admin", "zones"], queryFn: () => get<Zone[]>("admin/shipping-zones") });
  const [edit, setEdit] = useState<Record<string, { fee: string; days: string }>>({});
  const [line, setLine] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Zone> }) => api<Zone>(`admin/shipping-zones/${id}`, { method: "PATCH", body }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "zones"] });
      setLine({ msg: t("{z} saved.", { z: lang === "ar" ? r.data.nameAr : r.data.nameEn }), tone: "ok" });
    },
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`admin/shipping-zones/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "zones"] }),
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });
  return (
    <Panel title={t("Delivery zones")}>
      <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t("Customers in a governorate without an active zone can't check out.")}</p>
      <ErrorLine error={zones.error} />
      {zones.isPending ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t("Governorate")}</th>
                <th>{t("Fee (EGP)")}</th>
                <th>{t("Days")}</th>
                <th>{t("Active")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zones.data?.map((z) => {
                const e = edit[z.id] ?? { fee: toEgp(z.feeCents), days: z.days };
                const dirty = e.fee !== toEgp(z.feeCents) || e.days !== z.days;
                return (
                  <tr key={z.id}>
                    <td className="adm-cell-title">{lang === "ar" ? z.nameAr : z.nameEn}</td>
                    <td data-label={t("Fee (EGP)")}>
                      {isAdmin ? (
                        <input className="adm-input w-24" inputMode="decimal" aria-label={t("Fee (EGP)")} value={e.fee} onChange={(ev) => setEdit({ ...edit, [z.id]: { ...e, fee: ev.target.value } })} />
                      ) : (
                        money(z.feeCents)
                      )}
                    </td>
                    <td data-label={t("Days")}>
                      {isAdmin ? (
                        <input className="adm-input w-20" aria-label={t("Days")} value={e.days} onChange={(ev) => setEdit({ ...edit, [z.id]: { ...e, days: ev.target.value } })} />
                      ) : (
                        z.days
                      )}
                    </td>
                    <td data-label={t("Active")}>
                      <Toggle label="" checked={z.isActive} disabled={!isAdmin} onChange={(c) => update.mutate({ id: z.id, body: { isActive: c } })} />
                    </td>
                    <td>
                      {isAdmin ? (
                        <div className="flex gap-1">
                          <Button
                            disabled={!dirty}
                            onClick={() => {
                              const fee = toCents(e.fee);
                              if (fee === null || Number.isNaN(fee)) return setLine({ msg: t("Enter a valid amount"), tone: "error" });
                              update.mutate({ id: z.id, body: { feeCents: fee, days: e.days.trim() } });
                            }}
                          >
                            {t("Save")}
                          </Button>
                          <Button variant="ghost" onClick={() => window.confirm(t("Stop delivering to {z}?", { z: z.nameEn })) && remove.mutate(z.id)}>
                            {t("Delete")}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <StatusLine message={line?.msg} tone={line?.tone} />
    </Panel>
  );
}

function Settings() {
  const { t } = useAdmin();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["admin", "settings"], queryFn: () => get<SettingRow[]>("admin/settings") });
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [line, setLine] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);

  useEffect(() => {
    if (!rows.data) return;
    const v: Record<string, string | boolean> = {};
    for (const r of rows.data) {
      if (r.type === "bool") v[r.key] = Boolean(r.value);
      else if (r.type === "money") v[r.key] = toEgp(Number(r.value));
      else if (r.type !== "json") v[r.key] = String(r.value ?? "");
    }
    setValues(v);
  }, [rows.data]);

  const save = useMutation({
    mutationFn: () => {
      const out: Record<string, unknown> = {};
      for (const r of rows.data ?? []) {
        if (!(r.key in values) || r.type === "json") continue;
        const v = values[r.key];
        if (r.type === "bool") out[r.key] = Boolean(v);
        else if (r.type === "money") {
          const c = toCents(String(v));
          if (c === null || Number.isNaN(c)) throw new Error(`${t(FIELDS.find((f) => f.key === r.key)?.label ?? r.key)}: ${t("Enter a valid amount")}`);
          out[r.key] = c;
        } else if (r.type === "int") out[r.key] = Number(v);
        else out[r.key] = String(v);
      }
      return api("admin/settings", { method: "PATCH", body: { values: out } });
    },
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["admin", "settings"] }), setLine({ msg: t("Settings saved."), tone: "ok" })),
    onError: (e) => setLine({ msg: t((e as Error).message), tone: "error" }),
  });

  const byKey = new Map(rows.data?.map((r) => [r.key, r]));
  return (
    <Panel title={t("Store settings")}>
      <ErrorLine error={rows.error} />
      {rows.isPending ? (
        <SkeletonRows rows={8} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset disabled={!isAdmin} className="grid gap-4 md:grid-cols-2">
            {FIELDS.filter((f) => byKey.has(f.key)).map((f) => {
              const r = byKey.get(f.key)!;
              const label = `${t(f.label)}${r.isPublic ? ` · ${t("Public")}` : ""}`;
              if (r.type === "bool") {
                return (
                  <div key={f.key} className="md:col-span-2">
                    <Toggle label={label} checked={Boolean(values[f.key])} onChange={(c) => setValues({ ...values, [f.key]: c })} />
                  </div>
                );
              }
              return (
                <Field key={f.key} label={label} hint={f.hint ? t(f.hint) : undefined}>
                  {(id, d) => (
                    <input
                      id={id}
                      aria-describedby={d}
                      type={r.type === "email" ? "email" : r.type === "url" ? "url" : "text"}
                      inputMode={r.type === "int" || r.type === "money" ? "decimal" : undefined}
                      value={String(values[f.key] ?? "")}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    />
                  )}
                </Field>
              );
            })}
          </fieldset>
          {isAdmin ? (
            <div className="mt-4">
              <Button type="submit" variant="primary" pending={save.isPending}>
                {t("Save settings")}
              </Button>
            </div>
          ) : null}
          <StatusLine message={line?.msg} tone={line?.tone} />
        </form>
      )}
    </Panel>
  );
}

export default function StorePage() {
  const { t } = useAdmin();
  return (
    <>
      <PageTitle title={t("Store")} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Settings />
        <Zones />
      </div>
    </>
  );
}
