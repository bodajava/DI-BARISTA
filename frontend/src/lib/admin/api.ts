"use client";

export interface PageMeta {
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  counts?: Record<string, number>;
  newCount?: number;
  allCount?: number;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(query?: Query): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Calls the API through the dashboard proxy; throws AdminApiError with the API's message */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query } = {},
): Promise<{ data: T; meta?: PageMeta; message?: string }> {
  const init: RequestInit = { method: opts.method ?? "GET", headers: { Accept: "application/json" } };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(`/api/admin/v1/${path.replace(/^\//, "")}${qs(opts.query)}`, init);
  if (res.status === 401 && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    window.location.href = `/admin/login?next=${encodeURIComponent(next)}`;
  }
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    meta?: PageMeta;
    message?: string;
    error?: string;
  };
  if (!res.ok || json.success === false) {
    throw new AdminApiError(json.error || json.message || `Request failed (${res.status})`, res.status);
  }
  return { data: json.data as T, meta: json.meta, message: json.message };
}

export const get = <T,>(path: string, query?: Query) => api<T>(path, { query }).then((r) => r.data);
export const getPage = <T,>(path: string, query?: Query) => api<T[]>(path, { query });
