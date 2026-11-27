"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Languages, Lock, Moon, Sun } from "lucide-react";
import { useAdmin } from "@/lib/admin-i18n";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("next") || searchParams.get("redirect") || "/admin";

  const { t, lang, theme, setLang, setTheme } = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "Invalid admin credentials");
        return;
      }

      const safeRedirect = redirectTarget.startsWith("/admin") && !redirectTarget.startsWith("//")
        ? redirectTarget
        : "/admin";
      router.push(safeRedirect);
      router.refresh();
    } catch {
      setError("Unable to reach authentication service");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="admin-strip" aria-hidden="true" />
      <div className="flex-1 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-[400px] lo-card p-7 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/media/brand-mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px]" />
              <div>
                <div className="admin-wordmark text-sm text-[var(--foreground)]">DI BARISTA</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">{t("Admin sign in")}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                className="lo-btn lo-btn-ghost h-7 px-2 text-xs"
              >
                <Languages className="h-3.5 w-3.5" />
                <span>{lang === "ar" ? "EN" : "عربي"}</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="lo-btn lo-btn-ghost h-7 px-2 text-xs"
                aria-label={t(theme === "dark" ? "Light mode" : "Dark mode")}
              >
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">
            {t("Sign in to manage orders, products and customers.")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="text-xs text-[var(--muted-foreground)] block">
                {t("Email")}
              </label>
              <input
                id="admin-email"
                type="email"
                required
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="lo-input w-full h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="text-xs text-[var(--muted-foreground)] block">
                {t("Password")}
              </label>
              <input
                id="admin-password"
                type="password"
                required
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="lo-input w-full h-10 text-sm"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-xs text-[var(--destructive)]">
                {t(error)}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="lo-btn lo-btn-primary w-full h-10 text-sm justify-center"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>{loading ? t("Signing in…") : t("Sign in")}</span>
            </button>
          </form>

          <div className="pt-3 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
            <Link href={`/${lang}`} className="hover:text-[var(--foreground)]">
              {t("Back to the store")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-xs font-mono text-[var(--muted-foreground)]">
          …
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
