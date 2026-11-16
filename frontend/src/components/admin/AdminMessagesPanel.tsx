"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Archive, Inbox, MailOpen, RefreshCw, Reply, Trash2 } from "lucide-react";
import type { IContactMessage, IPaginationMeta } from "@/lib/types";
import { useAdmin } from "@/lib/admin-i18n";

type Filter = "ALL" | "NEW" | "READ" | "ARCHIVED";

/** Messages sent from the storefront footer form (email + message) */
export function AdminMessagesPanel({ searchFilter }: { searchFilter: string }) {
  const { t, num, date } = useAdmin();
  const [rows, setRows] = useState<IContactMessage[]>([]);
  const [meta, setMeta] = useState<(IPaginationMeta & { newCount?: number }) | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: String(page) });
    if (filter !== "ALL") params.set("status", filter);
    if (searchFilter.trim()) params.set("search", searchFilter.trim());
    fetch(`/api/admin/messages?${params}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");
        if (!alive) return;
        setRows(json.data || []);
        setMeta(json.meta || null);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [page, filter, searchFilter, reloadKey]);

  const idOf = (m: IContactMessage) => m.id || m._id || "";

  const setStatus = async (m: IContactMessage, status: IContactMessage["status"]) => {
    await fetch(`/api/admin/messages/${encodeURIComponent(idOf(m))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reload();
  };

  const remove = async (m: IContactMessage) => {
    if (!window.confirm(`${t("Delete")}: ${m.email}?`)) return;
    await fetch(`/api/admin/messages/${encodeURIComponent(idOf(m))}`, { method: "DELETE" });
    reload();
  };

  const toggleOpen = (m: IContactMessage) => {
    const id = idOf(m);
    setOpenId((current) => (current === id ? null : id));
    if (m.status === "NEW") void setStatus(m, "READ");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Inbox className="h-4 w-4" /> {t("Customer messages")}
            {meta?.newCount ? (
              <span className="lo-badge text-[11px] bg-[var(--primary)] text-[var(--primary-foreground)]">{num(meta.newCount)} {t("new")}</span>
            ) : null}
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {t("Sent from the contact form in the store footer. Opening a message marks it as read.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "NEW", "READ", "ARCHIVED"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className="lo-nav-link text-xs"
              aria-current={filter === f ? "page" : undefined}
              onClick={() => {
                setFilter(f);
                setPage(1);
                setLoading(true);
              }}
            >
              {t(f[0] + f.slice(1).toLowerCase())}
            </button>
          ))}
          <button type="button" onClick={reload} className="lo-btn lo-btn-ghost h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> <span>{t("Refresh")}</span>
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}

      <div className="lo-card divide-y divide-[var(--border)]">
        {loading && rows.length === 0 ? (
          <p className="p-4 text-xs text-[var(--muted-foreground)]">{t("Loading…")}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-xs text-[var(--muted-foreground)]">{t("No messages here.")}</p>
        ) : (
          rows.map((m) => {
            const open = openId === idOf(m);
            return (
              <article key={idOf(m)} className="p-4">
                <button
                  type="button"
                  className="w-full text-start flex items-start gap-3"
                  onClick={() => toggleOpen(m)}
                  aria-expanded={open}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                      m.status === "NEW" ? "bg-[var(--primary)]" : "bg-transparent"
                    }`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className={`font-mono text-xs ${m.status === "NEW" ? "font-semibold" : ""}`}>
                        {m.email}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--muted-foreground)] shrink-0">
                        {date(m.createdAt)} · {m.locale.toUpperCase()}
                      </span>
                    </span>
                    <span
                      className={`block text-xs text-[var(--muted-foreground)] mt-1 ${open ? "" : "truncate"}`}
                      dir="auto"
                      style={{ whiteSpace: open ? "pre-wrap" : undefined }}
                    >
                      {m.message}
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="flex flex-wrap gap-2 mt-3 ps-5">
                    <a
                      href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent("DI BARISTA")}`}
                      className="lo-btn lo-btn-primary h-7 text-xs"
                    >
                      <Reply className="h-3.5 w-3.5" /> <span>{t("Reply by email")}</span>
                    </a>
                    {m.status !== "NEW" && (
                      <button type="button" className="lo-btn lo-btn-ghost h-7 text-xs" onClick={() => void setStatus(m, "NEW")}>
                        <MailOpen className="h-3.5 w-3.5" /> <span>{t("Mark unread")}</span>
                      </button>
                    )}
                    {m.status !== "ARCHIVED" && (
                      <button type="button" className="lo-btn lo-btn-ghost h-7 text-xs" onClick={() => void setStatus(m, "ARCHIVED")}>
                        <Archive className="h-3.5 w-3.5" /> <span>{t("Archive")}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="lo-btn lo-btn-ghost h-7 text-xs text-[var(--destructive)]"
                      onClick={() => void remove(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> <span>{t("Delete")}</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs font-mono">
          <button type="button" className="lo-btn lo-btn-ghost h-7 text-xs" disabled={!meta.hasPrevPage} onClick={() => { setLoading(true); setPage((p) => Math.max(1, p - 1)); }}>
            {t("Prev")}
          </button>
          <span>
            {meta.page} / {meta.totalPages}
          </span>
          <button type="button" className="lo-btn lo-btn-ghost h-7 text-xs" disabled={!meta.hasNextPage} onClick={() => { setLoading(true); setPage((p) => p + 1); }}>
            {t("Next")}
          </button>
        </div>
      )}
    </div>
  );
}
