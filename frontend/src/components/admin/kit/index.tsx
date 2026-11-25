"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useAdmin } from "@/lib/admin-i18n";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/admin/types";

export function PageTitle({ title, aside, eyebrow }: { title: string; aside?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-sm text-[var(--muted-foreground)]">{eyebrow}</div> : null}
        <h1 className="adm-title">{title}</h1>
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`adm-panel ${className}`}>
      {title || action ? (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="adm-panel-title">{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-lg bg-[var(--muted)] ${className}`} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="adm-empty">{children}</p>;
}

export function ErrorLine({ error }: { error: unknown }) {
  const { t } = useAdmin();
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className="adm-error">
      {t(message)}
    </p>
  );
}

const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "amber",
  CONFIRMED: "brand",
  PREPARING: "violet",
  SHIPPED: "teal",
  DELIVERED: "green",
  CANCELLED: "muted",
  REFUNDED: "red",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Waiting for payment",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  SHIPPED: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useAdmin();
  return (
    <span className="adm-badge" data-tone={STATUS_TONE[status] ?? "muted"}>
      {t(STATUS_LABEL[status] ?? status)}
    </span>
  );
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partly refunded",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH_ON_DELIVERY: "Cash on delivery",
  PAYMOB_CARD: "Card",
  MOBILE_WALLET: "Wallet",
};

export function PaymentText({ status }: { status: PaymentStatus }) {
  const { t } = useAdmin();
  const tone = status === "PAID" ? "green" : status === "PENDING" ? "amber" : status === "FAILED" ? "red" : "muted";
  return (
    <span className="adm-paytext" data-tone={tone}>
      {t(PAYMENT_LABEL[status] ?? status)}
    </span>
  );
}

/** Segmented pill radiogroup */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="adm-seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-active={o.value === value || undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const { t, dir } = useAdmin();
  if (totalPages <= 1) return null;
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  return (
    <nav aria-label={t("Pages")} className="mt-5 flex items-center justify-center gap-3">
      <button type="button" className="adm-icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("Previous page")}>
        <Prev size={16} />
      </button>
      <span className="text-sm tabular-nums text-[var(--muted-foreground)]">
        {t("{page} / {total}", { page, total: totalPages })}
      </span>
      <button type="button" className="adm-icon-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label={t("Next page")}>
        <Next size={16} />
      </button>
    </nav>
  );
}

export function Button({
  children,
  variant = "secondary",
  pending,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || pending}
      aria-busy={pending || undefined}
      className={`adm-btn ${className}`}
      data-variant={variant}
    >
      {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Link href={href} className="adm-btn" data-variant={variant}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}</label>
      {children(id, [hintId, errId].filter(Boolean).join(" ") || undefined)}
      {hint ? (
        <small id={hintId} className="adm-hint">
          {hint}
        </small>
      ) : null}
      {error ? (
        <small id={errId} className="adm-field-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="adm-toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
      {label}
    </label>
  );
}

/** Live confirmation line for screen readers and sighted users */
export function StatusLine({ message, tone = "ok" }: { message?: string | null; tone?: "ok" | "error" }) {
  return (
    <p role="status" aria-live="polite" className="adm-statusline" data-tone={tone}>
      {message ?? ""}
    </p>
  );
}

/** Piasters <-> EGP text for form inputs */
export const toEgp = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : String(Math.round(cents) / 100);
export const toCents = (egp: string): number | null => {
  const v = egp.trim().replace(/,/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
