"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Store, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAdmin } from "@/lib/admin-i18n";
import type { SessionUser } from "@/lib/admin/types";
import { onForegroundPush } from "@/lib/admin/push";
import { SessionContext } from "./session";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/marketing", label: "Marketing" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/store", label: "Store" },
  { href: "/admin/ai", label: "AI Analyst" },
];

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Owner", ADMIN: "Admin", STAFF: "Staff" };

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

type SessionResult = { state: "ok"; user: SessionUser } | { state: "guest" } | { state: "forbidden" };

async function loadSession(): Promise<SessionResult> {
  const res = await fetch("/api/admin/session", { cache: "no-store" });
  if (res.status === 401) return { state: "guest" };
  if (res.status === 403) return { state: "forbidden" };
  const json = (await res.json()) as { data?: { user?: SessionUser } };
  if (!json.data?.user) return { state: "guest" };
  if (!["STAFF", "ADMIN", "SUPER_ADMIN"].includes(json.data.user.role)) return { state: "forbidden" };
  return { state: "ok", user: json.data.user };
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-6 text-center">{children}</div>;
}

function BrandMark({ size = 30 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/media/brand-mark.png" alt="" width={size} height={size} />;
}

function Shell({ children }: { children: ReactNode }) {
  const { t, lang, theme, setLang, setTheme } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<Record<string, string> | null>(null);

  useEffect(() => setHydrated(true), []);
  const session = useQuery({ queryKey: ["admin", "session"], queryFn: loadSession, enabled: hydrated, staleTime: 60_000 });

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (session.data?.state === "guest") {
      const next = window.location.pathname + window.location.search;
      router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
    }
  }, [session.data, router]);

  // A push while the dashboard is open: refresh every dashboard query and show a toast
  useEffect(() => {
    if (session.data?.state !== "ok") return;
    let stop: () => void = () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    onForegroundPush((data) => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      setToast(data);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 8000);
    }).then((fn) => (stop = fn));
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [session.data, queryClient]);

  if (!hydrated || session.isPending) {
    return (
      <Centered>
        <div className="grid justify-items-center gap-4" role="status">
          <BrandMark size={44} />
          <p className="text-sm text-[var(--muted-foreground)]">{t("Checking your access…")}</p>
        </div>
      </Centered>
    );
  }
  if (session.data?.state === "forbidden") {
    return (
      <Centered>
        <div className="grid max-w-sm justify-items-center gap-4">
          <h1 className="adm-title text-2xl">{t("This account can't open the dashboard")}</h1>
          <form action="/api/admin/logout" method="post">
            <button className="adm-btn" data-variant="primary">
              {t("Sign in with another account")}
            </button>
          </form>
        </div>
      </Centered>
    );
  }
  if (session.data?.state !== "ok") return null;
  const user = session.data.user;

  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    router.replace("/admin/login");
  };

  const prefs = (
    <>
      <button type="button" className="adm-btn" data-variant="ghost" onClick={() => setLang(lang === "ar" ? "en" : "ar")} lang={lang === "ar" ? "en" : "ar"}>
        {lang === "ar" ? "EN" : "عربي"}
      </button>
      <button
        type="button"
        className="adm-icon-btn"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? t("Light mode") : t("Dark mode")}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </>
  );

  return (
    <SessionContext.Provider value={user}>
      <a href="#adm-main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 adm-btn">
        {t("Skip to content")}
      </a>
      <header className="adm-header">
        <Link href="/admin" className="adm-brand">
          <BrandMark />
          <span className="grid leading-tight">
            <strong className="text-sm tracking-[0.2em]">DI BARISTA</strong>
            <small>{t("Dashboard")}</small>
          </span>
        </Link>
        <nav className="adm-nav" aria-label={t("Dashboard")}>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
              {t(item.label)}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {prefs}
            <Link href="/" className="adm-btn" data-variant="ghost" target="_blank" rel="noopener">
              <Store size={15} /> {t("View store")}
            </Link>
            <span className="grid text-end leading-tight">
              <span className="max-w-[12rem] truncate text-sm font-semibold">{user.fullName}</span>
              <small className="text-[11px] text-[var(--muted-foreground)]">{t(ROLE_LABEL[user.role] ?? user.role)}</small>
            </span>
            <button type="button" className="adm-icon-btn" onClick={signOut} aria-label={t("Sign out")}>
              <LogOut size={15} />
            </button>
          </div>
          <button
            type="button"
            className="adm-btn adm-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="adm-sheet"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={16} /> : <Menu size={16} />} {t("Menu")}
          </button>
        </div>
      </header>
      {menuOpen ? (
        <div id="adm-sheet" className="adm-sheet">
          <nav aria-label={t("Dashboard")}>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                {t(item.label)}
              </Link>
            ))}
          </nav>
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-2 pt-3 md:hidden">
            {prefs}
            <Link href="/" className="adm-btn" data-variant="ghost" target="_blank" rel="noopener">
              <Store size={15} /> {t("View store")}
            </Link>
            <span className="ms-auto text-sm">
              {user.fullName} · <small className="text-[var(--muted-foreground)]">{t(ROLE_LABEL[user.role] ?? user.role)}</small>
            </span>
            <button type="button" className="adm-btn" onClick={signOut}>
              <LogOut size={15} /> {t("Sign out")}
            </button>
          </div>
        </div>
      ) : null}
      <main id="adm-main" className="adm-main">
        {children}
      </main>
      {toast ? (
        <div className="adm-toast" role="status">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <strong className="block">{toast.title}</strong>
              <p className="mt-1 text-sm opacity-90">{toast.body}</p>
              {toast.link ? (
                <Link href={toast.link} className="mt-2 inline-block text-sm font-semibold underline" onClick={() => setToast(null)}>
                  {t("Open →")}
                </Link>
              ) : null}
            </div>
            <button type="button" aria-label={t("Close")} onClick={() => setToast(null)} className="opacity-80 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </SessionContext.Provider>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: true, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Shell>{children}</Shell>
    </QueryClientProvider>
  );
}
