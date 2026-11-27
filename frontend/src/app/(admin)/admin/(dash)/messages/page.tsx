"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import { Check, Mail, MailOpen, MessageCircle, Reply, Trash2 } from "lucide-react";
import { Button, Empty, ErrorLine, PageTitle, Pagination, Panel, SkeletonRows } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { api, getPage } from "@/lib/admin/api";
import type { Message } from "@/lib/admin/types";
import { useUrlState } from "@/lib/admin/url-state";

function wa(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("01") && d.length === 11) d = `2${d}`;
  return `https://wa.me/${d}`;
}

function MessagesInner() {
  const { t, date } = useAdmin();
  const qc = useQueryClient();
  const url = useUrlState();
  const unread = url.get("tab") === "unread";
  const page = Number(url.get("page", "1")) || 1;
  const query = { unread: unread ? "1" : undefined, page, limit: 20 };
  const list = useQuery({
    queryKey: ["admin", "messages", query],
    queryFn: () => getPage<Message>("contact/messages", query),
    placeholderData: keepPreviousData,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Message["status"] }) => api(`contact/messages/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "messages"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`contact/messages/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "messages"] }),
  });
  const meta = list.data?.meta;
  const docs = list.data?.data ?? [];

  return (
    <>
      <PageTitle title={t("Messages")} />
      <div role="tablist" aria-label={t("Messages")} className="adm-tabs mb-4">
        <button type="button" role="tab" aria-selected={!unread} onClick={() => url.set({ tab: null })}>
          {t("All")} <span>{meta?.allCount ?? ""}</span>
        </button>
        <button type="button" role="tab" aria-selected={unread} onClick={() => url.set({ tab: "unread" })}>
          {t("Unread")} <span>{meta?.newCount ?? ""}</span>
        </button>
      </div>
      <ErrorLine error={list.error || update.error || remove.error} />
      {list.isPending ? (
        <SkeletonRows rows={6} />
      ) : docs.length === 0 ? (
        <Panel>
          <Empty>{unread ? t("No unread messages.") : t("No messages yet. Messages from the contact form land here.")}</Empty>
        </Panel>
      ) : (
        <ul className="grid gap-3">
          {docs.map((m) => (
            <li key={m.id}>
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {m.name || m.email}
                      {m.status === "NEW" ? <span className="adm-chip" data-tone="brand">{t("New")}</span> : null}
                      {m.status === "REPLIED" ? <span className="adm-chip" data-tone="green">{t("Replied {d}", { d: date(m.repliedAt) })}</span> : null}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {[m.email, m.phone].filter(Boolean).join(" · ")} · {date(m.createdAt)}
                    </p>
                  </div>
                </div>
                {m.subject ? <p className="mt-3 font-semibold">{m.subject}</p> : null}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed" dir="auto">
                  {m.message}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    className="adm-btn"
                    data-variant="primary"
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "DI BARISTA"}`)}`}
                    onClick={() => m.status !== "REPLIED" && update.mutate({ id: m.id, status: "REPLIED" })}
                  >
                    <Reply size={14} /> {t("Reply by email")}
                  </a>
                  {m.phone ? (
                    <a className="adm-btn" href={wa(m.phone)} target="_blank" rel="noopener">
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  ) : null}
                  {m.status === "NEW" ? (
                    <Button onClick={() => update.mutate({ id: m.id, status: "READ" })}>
                      <MailOpen size={14} /> {t("Mark as read")}
                    </Button>
                  ) : (
                    <Button onClick={() => update.mutate({ id: m.id, status: "NEW" })}>
                      <Mail size={14} /> {t("Mark as unread")}
                    </Button>
                  )}
                  {m.status !== "REPLIED" ? (
                    <Button onClick={() => update.mutate({ id: m.id, status: "REPLIED" })}>
                      <Check size={14} /> {t("Mark as replied")}
                    </Button>
                  ) : null}
                  <Button variant="danger" onClick={() => window.confirm(t("Delete this message?")) && remove.mutate(m.id)}>
                    <Trash2 size={14} /> {t("Delete")}
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={meta?.totalPages ?? 1} onPage={(p) => url.set({ page: p })} />
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <MessagesInner />
    </Suspense>
  );
}
