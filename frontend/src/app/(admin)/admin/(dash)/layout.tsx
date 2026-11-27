import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

/** Dashboard pages wait for the staff session on the client, so they are not prerendered */
export const instant = false;

/** The shell reads the URL (active link, ?next=), so it streams in after the static frame */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
