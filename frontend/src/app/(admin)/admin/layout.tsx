import React from "react";
import type { Metadata } from "next";
import { AdminPrefsProvider } from "@/lib/admin-i18n";

export const metadata: Metadata = {
  title: { absolute: "Admin | DI BARISTA" },
  description: "DIBARESTA CAFFE store management.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminPrefsProvider>
      <div className="theme-linear-orbit admin-coffee min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased transition-colors duration-150">
        {children}
      </div>
    </AdminPrefsProvider>
  );
}
