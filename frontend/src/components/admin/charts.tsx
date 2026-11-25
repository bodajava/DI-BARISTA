"use client";

import { useAdmin } from "@/lib/admin-i18n";

export interface TrendPoint {
  bucket: string;
  revenueCents: number;
  orders: number;
}

/** Revenue bars per day/week/month, with an accessible table fallback */
export function TrendChart({ points, granularity }: { points: TrendPoint[]; granularity: string }) {
  const { money, t, lang } = useAdmin();
  const W = 720;
  const H = 220;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...points.map((p) => p.revenueCents));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const step = innerW / Math.max(1, points.length);
  const barW = Math.max(3, Math.min(42, step * 0.7));
  const label = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-EG", {
      day: "numeric",
      month: "short",
      ...(granularity === "month" ? { year: "2-digit", day: undefined } : {}),
    });
  const every = Math.ceil(points.length / 8);
  const ordered = lang === "ar" ? [...points].reverse() : points;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="adm-chart" role="img" aria-label={t("Sales over time")}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} className="grid" x1={pad.l} x2={W - pad.r} y1={pad.t + innerH * (1 - f)} y2={pad.t + innerH * (1 - f)} />
        ))}
        {ordered.map((p, i) => {
          const h = (p.revenueCents / max) * innerH;
          const x = pad.l + i * step + (step - barW) / 2;
          return (
            <g key={p.bucket}>
              <rect className="bar" x={x} y={pad.t + innerH - h} width={barW} height={Math.max(h, p.revenueCents ? 2 : 0)} rx={4}>
                <title>{`${label(p.bucket)} · ${money(p.revenueCents)} · ${p.orders}`}</title>
              </rect>
              {i % every === 0 ? (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle">
                  {label(p.bucket)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{t("Sales over time")}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.bucket}>
              <th scope="row">{label(p.bucket)}</th>
              <td>{money(p.revenueCents)}</td>
              <td>{p.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function BarList({
  rows,
  format,
}: {
  rows: Array<{ key: string; label: string; value: number; sub?: string }>;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="adm-bars">
      {rows.map((r) => (
        <li key={r.key} className="adm-bar-row">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular-nums text-[var(--muted-foreground)]">
              {format(r.value)}
              {r.sub ? ` · ${r.sub}` : ""}
            </span>
          </div>
          <div className="adm-bar-track">
            <div className="adm-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
