"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Mail, RefreshCw, Trash2 } from "lucide-react";
import type { IPaginationMeta, ISubscriber } from "@/lib/types";
import { useAdmin } from "@/lib/admin-i18n";

/** Newsletter sign-ups collected by the storefront "Subscribe now" form */
export function AdminSubscribersPanel({ searchFilter }: { searchFilter: string }) {
  const { t, num, date } = useAdmin();
  const [rows, setRows] = useState<ISubscriber[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: String(page) });
    if (searchFilter.trim()) params.set("search", searchFilter.trim());
    fetch(`/api/admin/subscribers?${params}`, { cache: "no-store" })
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
  }, [page, searchFilter, reloadKey]);

  const active = useMemo(() => rows.filter((r) => r.isActive), [rows]);

  const exportCsv = () => {
    const lines = [
      "email,language,signed_up",
      ...active.map((r) =>
        [r.email, r.locale, r.createdAt ? r.createdAt.split("T")[0] : ""].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (row: ISubscriber) => {
    const id = row.id || row._id;
    if (!id || !window.confirm(`Remove ${row.email} from the list?`)) return;
    await fetch(`/api/admin/subscribers/${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4" /> {t("Newsletter subscribers")}
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {t("People who entered their email in “Subscribe now” on the store.")}
            {meta ? ` ${num(meta.totalDocs)} ${t("total")}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reload} className="lo-btn lo-btn-ghost h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> <span>{t("Refresh")}</span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={active.length === 0}
            className="lo-btn lo-btn-primary h-8 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> <span>{t("Export CSV")}</span>
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}

      <div className="lo-card overflow-x-auto">
        <table className="lo-table">
          <thead>
            <tr>
              <th>{t("Email")}</th>
              <th>{t("Language")}</th>
              <th>{t("Signed up")}</th>
              <th>{t("Status")}</th>
              <th className="text-right">{t("Remove")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-xs text-[var(--muted-foreground)]">{t("Loading…")}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-xs text-[var(--muted-foreground)]">
                  {t("No subscribers yet.")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id || r._id || r.email}>
                  <td className="font-mono text-xs">{r.email}</td>
                  <td className="font-mono text-xs uppercase">{r.locale}</td>
                  <td className="font-mono text-xs text-[var(--muted-foreground)]">
                    {date(r.createdAt)}
                  </td>
                  <td>
                    <span className="lo-badge lo-badge-outline text-[11px]">
                      <span
                        className={`h-1.5 w-1.5 rounded-full me-1.5 ${
                          r.isActive ? "bg-[var(--success)]" : "bg-[var(--destructive)]"
                        }`}
                      />
                      {t(r.isActive ? "SUBSCRIBED" : "REMOVED")}
                    </span>
                  </td>
                  <td className="text-right">
                    {r.isActive && (
                      <button
                        type="button"
                        onClick={() => void remove(r)}
                        className="lo-btn lo-btn-ghost h-7 px-2 text-xs text-[var(--destructive)]"
                        aria-label={`Remove ${r.email}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs font-mono">
          <button
            type="button"
            className="lo-btn lo-btn-ghost h-7 text-xs"
            disabled={!meta.hasPrevPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("Prev")}
          </button>
          <span>
            {meta.page} / {meta.totalPages}
          </span>
          <button
            type="button"
            className="lo-btn lo-btn-ghost h-7 text-xs"
            disabled={!meta.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Next")}
          </button>
        </div>
      )}
    </div>
  );
}
