"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Coffee,
  Inbox,
  Languages,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  Package,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  TicketPercent,
  X,
} from "lucide-react";
import { AdminCouponsPanel } from "@/components/admin/AdminCouponsPanel";
import { AdminSubscribersPanel } from "@/components/admin/AdminSubscribersPanel";
import { AdminMessagesPanel } from "@/components/admin/AdminMessagesPanel";
import { AdminOrdersPanel } from "@/components/admin/AdminOrdersPanel";
import { AdminProductsPanel } from "@/components/admin/AdminProductsPanel";
import { useAdmin } from "@/lib/admin-i18n";
import type {
  IBrandRef,
  IBusinessInsights,
  ICategoryRef,
  ICoupon,
  ICustomersDirectoryAnalytics,
  IInsightBucket,
  IOrder,
  IOverviewAnalytics,
  IProduct,
  IProductsPerformanceAnalytics,
  ISalesTrendAnalytics,
} from "@/lib/types";

type AdminTab = "overview" | "products" | "orders" | "coupons" | "messages" | "subscribers" | "insights";

interface IAnalyticsBundle {
  overview: IOverviewAnalytics;
  performance: IProductsPerformanceAnalytics;
  customers: ICustomersDirectoryAnalytics;
  salesTrend: ISalesTrendAnalytics;
  insights: IBusinessInsights | null;
  productEngagement: {
    totalViews: number;
    totalSold: number;
    catalogConversionRate: number;
    viewerLeaderboard: Array<{
      id: string;
      name: string;
      sku: string;
      slug: string;
      viewsCount: number;
      soldCount: number;
      stock: number;
      finalPriceCents: number;
      conversionRate: number;
    }>;
  };
}

const TABS: AdminTab[] = ["overview", "orders", "products", "coupons", "messages", "subscribers", "insights"];
const TAB_LABEL: Record<AdminTab, string> = {
  overview: "Overview",
  products: "Products",
  orders: "Orders",
  coupons: "Coupons",
  messages: "Messages",
  subscribers: "Subscribers",
  insights: "Insights",
};
const TAB_ICON: Record<AdminTab, typeof Package> = {
  overview: LayoutDashboard,
  orders: Receipt,
  products: Package,
  coupons: TicketPercent,
  messages: Inbox,
  subscribers: Mail,
  insights: BarChart3,
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Delta({ now, before }: { now: number; before: number }) {
  const { pct } = useAdmin();
  if (!before && !now) return <span className="admin-delta">—</span>;
  if (!before) return <span className="admin-delta" data-trend="up">+∞</span>;
  const change = (now - before) / before;
  return (
    <span className="admin-delta font-mono" data-trend={change >= 0 ? "up" : "down"}>
      {change >= 0 ? "▲" : "▼"} {pct(Math.abs(change))}
    </span>
  );
}

function Kpi({
  label,
  value,
  foot,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="lo-card p-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
        <span className="uppercase tracking-wider">{label}</span>
        {accent && <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />}
      </div>
      <div className="text-2xl font-semibold text-[var(--foreground)] tabular-nums">{value}</div>
      {foot && <div className="text-xs text-[var(--muted-foreground)]">{foot}</div>}
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="lo-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{title}</h2>
        {aside && <span className="text-xs text-[var(--muted-foreground)]">{aside}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Label + value + proportional bar, used by every breakdown */
function Breakdown({
  rows,
  label,
  value,
  measure,
}: {
  rows: IInsightBucket[];
  label: (r: IInsightBucket) => string;
  value: (r: IInsightBucket) => string;
  measure: (r: IInsightBucket) => number;
}) {
  const { t } = useAdmin();
  const max = Math.max(1, ...rows.map(measure));
  if (rows.length === 0) return <p className="text-xs text-[var(--muted-foreground)]">{t("No data yet.")}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={`${String(r._id)}-${i}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate">{label(r)}</span>
            <span className="font-mono tabular-nums">{value(r)}</span>
          </div>
          <div className="admin-bar">
            <span style={{ width: `${Math.max(3, (measure(r) / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Simple bar chart of the daily sales trend (no chart library needed) */
function TrendChart({ series }: { series: ISalesTrendAnalytics["series"] }) {
  const { t, money, num } = useAdmin();
  const points = series.slice(-30);
  if (points.length === 0) return <p className="text-xs text-[var(--muted-foreground)]">{t("No sales recorded yet.")}</p>;
  const max = Math.max(1, ...points.map((p) => p.revenueCents));
  return (
    <div>
      <div className="flex items-end gap-1 h-40" dir="ltr">
        {points.map((p) => (
          <div
            key={p.period}
            className="flex-1 rounded-t bg-[var(--primary)] opacity-80 hover:opacity-100 transition-opacity"
            style={{ height: `${Math.max(2, (p.revenueCents / max) * 100)}%` }}
            title={`${p.period} · ${money(p.revenueCents)} · ${num(p.ordersCount)} ${t("orders")}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[11px] font-mono text-[var(--muted-foreground)]" dir="ltr">
        <span>{points[0]?.period}</span>
        <span>{points[points.length - 1]?.period}</span>
      </div>
    </div>
  );
}

function Heat({ rows, size, labels }: { rows: IInsightBucket[]; size: number; labels: string[] }) {
  const counts = Array.from({ length: size }, (_, i) => rows.find((r) => Number(r._id) === i + (size === 7 ? 1 : 0))?.orders ?? 0);
  const max = Math.max(1, ...counts);
  return (
    <div>
      <div className="admin-heat" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} dir="ltr">
        {counts.map((c, i) => (
          <span key={i} title={`${labels[i]}: ${c}`} style={{ opacity: 0.12 + (c / max) * 0.88 }} />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] font-mono text-[var(--muted-foreground)]" dir="ltr">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(size / 2)]}</span>
        <span>{labels[size - 1]}</span>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { t, lang, theme, setLang, setTheme, money, num, pct } = useAdmin();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // Phones show table rows as cards: copy each column header onto its cells as a label
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const label = () => {
      main.querySelectorAll<HTMLTableElement>("table.lo-table").forEach((table) => {
        const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() || "");
        table.querySelectorAll("tbody tr").forEach((tr) => {
          [...tr.children].forEach((td, i) => {
            const text = heads[i];
            if (text && td.getAttribute("data-label") !== text) td.setAttribute("data-label", text);
          });
        });
      });
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Close the phone menu with Escape and lock page scroll while it is open
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<IAnalyticsBundle | null>(null);
  const [products, setProducts] = useState<IProduct[]>([]);
  const [brands, setBrands] = useState<IBrandRef[]>([]);
  const [categories, setCategories] = useState<ICategoryRef[]>([]);
  const [orders, setOrders] = useState<IOrder[]>([]);
  const [coupons, setCoupons] = useState<ICoupon[]>([]);

  const loadWorkspaceData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const [anRes, prodRes, ordRes, coupRes, brandRes, catRes] = await Promise.all([
          fetch("/api/admin/analytics", { cache: "no-store" }),
          fetch("/api/products?includeInactive=true&limit=100", { cache: "no-store" }),
          fetch("/api/admin/orders?limit=100", { cache: "no-store" }),
          fetch("/api/admin/coupons", { cache: "no-store" }),
          fetch("/api/brands", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
        ]);

        if (anRes.status === 401 || ordRes.status === 401) {
          router.push("/admin/login");
          return;
        }

        const [anJson, prodJson, ordJson, coupJson, brandJson, catJson] = await Promise.all([
          anRes.json(),
          prodRes.json(),
          ordRes.json(),
          coupRes.json(),
          brandRes.json(),
          catRes.json(),
        ]);

        if (anJson.success) setAnalytics(anJson.data);
        if (prodJson.success) setProducts(prodJson.data || []);
        if (ordJson.success) setOrders(ordJson.data || []);
        if (coupJson.success) setCoupons(coupJson.data || []);
        if (brandJson.success) setBrands(brandJson.data || []);
        if (catJson.success) setCategories(catJson.data || []);
      } catch {
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadWorkspaceData(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWorkspaceData]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const overview = analytics?.overview;
  const engagement = analytics?.productEngagement;
  const ins = analytics?.insights ?? null;
  const salesTrend = analytics?.salesTrend?.series || [];
  const paymentLabel = (id: unknown) =>
    t(id === "CASH_ON_DELIVERY" ? "Cash on delivery" : id === "MOBILE_WALLET" ? "Mobile wallet" : "Card");

  return (
    <div className="flex flex-col min-h-screen">
      <div className="admin-strip" aria-hidden="true" />
      <header className="lo-nav sticky top-0 z-30 justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin" className="flex items-center gap-2 shrink-0" aria-label="DI BARISTA">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/media/brand-mark.png" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            <span className="admin-wordmark text-[11px] text-[var(--foreground)]">DI BARISTA</span>
            <span className="hidden sm:inline text-[11px] text-[var(--muted-foreground)]">{t("Admin")}</span>
          </Link>

          <span className="hidden lg:inline text-[var(--border)]">/</span>

          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className="lo-nav-link shrink-0"
                aria-current={activeTab === tab ? "page" : undefined}
                onClick={() => setActiveTab(tab)}
              >
                {t(TAB_LABEL[tab])}
              </button>
            ))}
            <Link
              href="/admin/ai-analyst"
              className="lo-nav-link text-[var(--primary)] font-semibold flex items-center gap-1.5 shrink-0"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              <span>{t("AI Analyst")}</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative hidden xl:flex items-center">
            <Search className="absolute start-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Filter records…")}
              className="lo-input pe-3 h-7 text-xs w-48 bg-[var(--card)]"
              style={{ paddingInlineStart: 32 }}
            />
          </div>

          <button
            type="button"
            onClick={() => void loadWorkspaceData(true)}
            className="lo-btn lo-btn-outline h-8 lg:h-7 text-xs px-2"
            title={t("Refresh live data")}
            aria-label={t("Refresh live data")}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <div className="hidden lg:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="lo-btn lo-btn-outline h-7 text-xs px-2"
              title={lang === "ar" ? "English" : "العربية"}
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{lang === "ar" ? "EN" : "عربي"}</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="lo-btn lo-btn-outline h-7 text-xs px-2"
              title={t(theme === "dark" ? "Light mode" : "Dark mode")}
              aria-label={t(theme === "dark" ? "Light mode" : "Dark mode")}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>

            <Link
              href={`/${lang}`}
              className="lo-btn lo-btn-secondary h-7 text-xs px-2.5"
              title={t("Storefront")}
            >
              <Coffee className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span className="hidden xl:inline">{t("Storefront")}</span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="lo-btn lo-btn-ghost h-7 text-xs px-2"
              title={t("Sign out")}
              aria-label={t("Sign out")}
            >
              <LogOut className="h-3.5 w-3.5 rtl:-scale-x-100" />
            </button>
          </div>

          {/* Phone / tablet: everything lives in the menu */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="lo-btn lo-btn-outline h-8 px-2"
              aria-label={t("Menu")}
              aria-expanded={menuOpen}
              aria-controls="admin-mobile-menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("Menu")}>
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label={t("Close")}
            onClick={() => setMenuOpen(false)}
          />
          <aside
            id="admin-mobile-menu"
            className="absolute inset-y-0 start-0 w-[min(84vw,320px)] bg-[var(--card)] border-e border-[var(--border)] flex flex-col shadow-xl"
          >
            <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--border)]">
              <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/media/brand-mark.png" alt="" width={24} height={24} className="h-6 w-6" />
                <span className="admin-wordmark text-[12px]">DI BARISTA</span>
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="lo-btn lo-btn-ghost h-8 px-2"
                aria-label={t("Close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 border-b border-[var(--border)]">
              <div className="relative flex items-center">
                <Search className="absolute start-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("Filter records…")}
                  className="lo-input pe-3 h-10 text-sm w-full bg-[var(--background)]"
                  style={{ paddingInlineStart: 36 }}
                />
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-2" aria-label={t("Admin")}>
              {TABS.map((tab) => {
                const Icon = TAB_ICON[tab];
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab);
                      setMenuOpen(false);
                      window.scrollTo({ top: 0 });
                    }}
                    aria-current={active ? "page" : undefined}
                    className={`w-full flex items-center gap-3 h-11 px-3 rounded-lg text-sm text-start transition-colors ${
                      active
                        ? "bg-[var(--accent)] text-[var(--foreground)] font-semibold"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-[var(--primary)]" : ""}`} />
                    <span>{t(TAB_LABEL[tab])}</span>
                  </button>
                );
              })}
              <Link
                href="/admin/ai-analyst"
                className="w-full flex items-center gap-3 h-11 px-3 rounded-lg text-sm font-semibold text-[var(--primary)] hover:bg-[var(--muted)]"
              >
                <Sparkles className="h-4 w-4" />
                <span>{t("AI Analyst")}</span>
              </Link>
            </nav>

            <div className="p-3 border-t border-[var(--border)] grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                className="lo-btn lo-btn-outline h-10 text-sm justify-center"
              >
                <Languages className="h-4 w-4" />
                <span>{lang === "ar" ? "English" : "العربية"}</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="lo-btn lo-btn-outline h-10 text-sm justify-center"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{t(theme === "dark" ? "Light mode" : "Dark mode")}</span>
              </button>
              <Link href={`/${lang}`} className="lo-btn lo-btn-secondary h-10 text-sm justify-center">
                <Coffee className="h-4 w-4 text-[var(--primary)]" />
                <span>{t("Storefront")}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="lo-btn lo-btn-ghost h-10 text-sm justify-center text-[var(--destructive)]"
              >
                <LogOut className="h-4 w-4 rtl:-scale-x-100" />
                <span>{t("Sign out")}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 max-w-[1240px] w-full mx-auto p-4 sm:p-6 space-y-6">
        {error && (
          <div className="p-3 rounded border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-xs text-[var(--destructive)]">
            {t(error)}
          </div>
        )}

        {activeTab === "overview" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
              <div>
                <div className="text-xs text-[var(--muted-foreground)] mb-1">{t("Live store data · Cairo")}</div>
                <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{t("Store overview")}</h1>
              </div>
              <Link href="/admin/ai-analyst" className="lo-btn lo-btn-primary h-8 text-xs">
                {t("Ask the AI analyst →")}
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                accent
                label={t("Today")}
                value={money(ins?.today.revenueCents)}
                foot={
                  <span className="flex items-center gap-2">
                    {num(ins?.today.orders)} {t("orders")} · <Delta now={ins?.today.revenueCents ?? 0} before={ins?.yesterday.revenueCents ?? 0} /> {t("vs yesterday")}
                  </span>
                }
              />
              <Kpi
                label={t("Last 30 days")}
                value={money(ins?.last30.revenueCents)}
                foot={
                  <span className="flex items-center gap-2 flex-wrap">
                    {num(ins?.last30.orders)} {t("orders")} · <Delta now={ins?.last30.revenueCents ?? 0} before={ins?.prev30.revenueCents ?? 0} /> {t("vs previous 30 days")}
                  </span>
                }
              />
              <Kpi
                accent={(ins?.openFulfilment ?? 0) > 0}
                label={t("To fulfil")}
                value={num(ins?.openFulfilment)}
                foot={t("Orders waiting to be roasted, packed or shipped")}
              />
              <Kpi
                label={t("Customers")}
                value={num(ins?.customersCount ?? overview?.uniqueCustomersCount)}
                foot={`${pct(ins?.repeatCustomerRate)} ${t("repeat customers")}`}
              />
              <Kpi
                label={t("Total revenue")}
                value={money(overview?.totalRevenueCents)}
                foot={`${num(overview?.paidOrdersCount)} ${t("settled orders")}`}
              />
              <Kpi
                label={t("Average order")}
                value={money(overview?.averageOrderValueCents)}
                foot={`${num(ins?.avgUnitsPerOrder, 1)} ${t("items per order")}`}
              />
              <Kpi
                label={t("Cancellation rate")}
                value={pct(ins?.cancellationRate30)}
                foot={t("Last 30 days, incl. refunds")}
              />
              <Kpi
                label={t("Abandoned online payments")}
                value={num(ins?.abandonedOnline30)}
                foot={t("Last 30 days")}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Card title={t("Sales trend")} aside={t("Last 30 days")}>
                  <TrendChart series={salesTrend} />
                </Card>
              </div>
              <Card title={t("Revenue by payment method")}>
                <Breakdown
                  rows={ins?.byPayment ?? []}
                  label={(r) => paymentLabel(r._id)}
                  value={(r) => `${money(r.revenueCents)} · ${num(r.orders)}`}
                  measure={(r) => r.revenueCents ?? 0}
                />
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title={t("Top governorates")}>
                <Breakdown
                  rows={ins?.byCity ?? []}
                  label={(r) => String(r._id || "—")}
                  value={(r) => `${num(r.orders)} · ${money(r.revenueCents)}`}
                  measure={(r) => r.orders ?? 0}
                />
              </Card>
              <Card title={t("Revenue by category")}>
                <Breakdown
                  rows={ins?.byCategory ?? []}
                  label={(r) => (lang === "ar" && r.nameAr ? r.nameAr : String(r._id || "—"))}
                  value={(r) => money(r.revenueCents)}
                  measure={(r) => r.revenueCents ?? 0}
                />
              </Card>
              <Card title={t("Low stock")}>
                {(ins?.lowStock ?? []).length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)]">{t("Everything is well stocked.")}</p>
                ) : (
                  <ul className="space-y-2">
                    {ins!.lowStock.map((p) => (
                      <li key={p._id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate">{lang === "ar" && p.nameAr ? p.nameAr : p.name}</span>
                        <span
                          className={`font-mono shrink-0 ${p.stock <= 3 ? "text-[var(--destructive)]" : "text-[var(--warning)]"}`}
                        >
                          {num(p.stock)} {t("left")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title={t("Audience")}>
                <div className="grid grid-cols-2 gap-4">
                  <button type="button" className="text-start" onClick={() => setActiveTab("subscribers")}>
                    <div className="text-2xl font-semibold tabular-nums">{num(ins?.subscribersTotal)}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{t("Newsletter subscribers")}</div>
                    <div className="text-xs text-[var(--success)] mt-1">
                      +{num(ins?.subscribers30)} {t("new in 30 days")}
                    </div>
                  </button>
                  <button type="button" className="text-start" onClick={() => setActiveTab("messages")}>
                    <div className="text-2xl font-semibold tabular-nums">{num(ins?.messagesNew)}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{t("Unread messages")}</div>
                    <div className="text-xs text-[var(--primary)] mt-1">{t("Open")} →</div>
                  </button>
                </div>
              </Card>
              <Card title={t("Coupon usage")}>
                <div className="text-2xl font-semibold tabular-nums">{pct(ins?.couponUsageRate)}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{t("of orders used a coupon")}</div>
                <div className="text-xs mt-3">
                  {t("Total discounts given")}: <span className="font-mono">{money(ins?.totalDiscountCents)}</span>
                </div>
              </Card>
              <Card title={t("When customers order")}>
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] text-[var(--muted-foreground)] mb-2">{t("By hour (Cairo time)")}</div>
                    <Heat rows={ins?.byHour ?? []} size={24} labels={Array.from({ length: 24 }, (_, h) => `${h}:00`)} />
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--muted-foreground)] mb-2">{t("By day of week")}</div>
                    <Heat rows={ins?.byWeekday ?? []} size={7} labels={WEEKDAYS.map((d) => t(d))} />
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {activeTab === "products" && (
          <AdminProductsPanel
            products={products}
            brands={brands}
            categories={categories}
            searchFilter={searchQuery}
            onRefresh={loadWorkspaceData}
          />
        )}

        {activeTab === "orders" && (
          <AdminOrdersPanel orders={orders} products={products} searchFilter={searchQuery} onRefresh={loadWorkspaceData} />
        )}

        {activeTab === "coupons" && (
          <AdminCouponsPanel coupons={coupons} searchFilter={searchQuery} onRefresh={loadWorkspaceData} />
        )}

        {activeTab === "messages" && <AdminMessagesPanel searchFilter={searchQuery} />}

        {activeTab === "subscribers" && <AdminSubscribersPanel searchFilter={searchQuery} />}

        {activeTab === "insights" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold">{t("Products & customers")}</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t("Best sellers, slow movers, product views and your top customers")}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="lo-card overflow-x-auto">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--success)]">
                    {t("Best sellers")}
                  </span>
                </div>
                <table className="lo-table">
                  <thead>
                    <tr>
                      <th>{t("Product")}</th>
                      <th>{t("Units")}</th>
                      <th className="text-right">{t("Revenue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.performance?.winnerProducts || []).map((w) => (
                      <tr key={w._id}>
                        <td>
                          <div className="text-xs font-medium">{w.name}</div>
                          <div className="text-[11px] font-mono text-[var(--muted-foreground)]">{w.sku}</div>
                        </td>
                        <td className="font-mono text-xs">{num(w.totalQuantitySold)}</td>
                        <td className="text-right font-mono text-xs">{money(w.totalRevenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lo-card overflow-x-auto">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--warning)]">
                    {t("Slow movers (many views, few sales)")}
                  </span>
                </div>
                <table className="lo-table">
                  <thead>
                    <tr>
                      <th>{t("Product")}</th>
                      <th>{t("Views / sold")}</th>
                      <th className="text-right">{t("Drop-off")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.performance?.loserHighDropOffProducts || []).map((l) => (
                      <tr key={l._id}>
                        <td>
                          <div className="text-xs font-medium">{lang === "ar" && l.nameAr ? l.nameAr : l.name}</div>
                          <div className="text-[11px] font-mono text-[var(--muted-foreground)]">
                            {l.sku} · {t("Stock")} {num(l.stock)}
                          </div>
                        </td>
                        <td className="font-mono text-xs">
                          {num(l.viewsCount)} / {num(l.soldCount)}
                        </td>
                        <td className="text-right font-mono text-xs text-[var(--destructive)]">{l.dropOffRatio}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lo-card overflow-x-auto">
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {t("Product views & conversion")}
                </span>
              </div>
              <table className="lo-table">
                <thead>
                  <tr>
                    <th>{t("SKU")}</th>
                    <th>{t("Product")}</th>
                    <th>{t("Views")}</th>
                    <th>{t("Sold")}</th>
                    <th className="text-right">{t("Conversion")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(engagement?.viewerLeaderboard || []).map((v) => (
                    <tr key={v.id}>
                      <td className="font-mono text-xs text-[var(--muted-foreground)]">{v.sku}</td>
                      <td className="text-xs font-medium">{v.name}</td>
                      <td className="font-mono text-xs">{num(v.viewsCount)}</td>
                      <td className="font-mono text-xs">{num(v.soldCount)}</td>
                      <td className="text-right font-mono text-xs">{num(v.conversionRate, 1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lo-card overflow-x-auto">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {t("Top customers")}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {t("Repeat")}: {num(analytics?.customers?.summary?.repeatBuyersCount)} · {t("One-time")}:{" "}
                  {num(analytics?.customers?.summary?.oneTimeBuyersCount)}
                </span>
              </div>
              <table className="lo-table">
                <thead>
                  <tr>
                    <th>{t("Customer")}</th>
                    <th>{t("Segment")}</th>
                    <th>{t("Orders")}</th>
                    <th>{t("Average order")}</th>
                    <th className="text-right">{t("Total spend")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.customers?.buyers || []).map((b) => (
                    <tr key={b.email}>
                      <td>
                        <div className="text-xs font-medium">{b.customerName}</div>
                        <div className="text-[11px] font-mono text-[var(--muted-foreground)]" dir="ltr">
                          {b.email} · {b.customerPhone}
                        </div>
                      </td>
                      <td>
                        <span className="lo-badge lo-badge-soft text-[10px]">{t(b.buyerType)}</span>
                      </td>
                      <td className="font-mono text-xs">{num(b.totalOrdersCount)}</td>
                      <td className="font-mono text-xs text-[var(--muted-foreground)]">{money(b.avgOrderValueCents)}</td>
                      <td className="text-right font-mono text-xs font-semibold">{money(b.totalSpendCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
