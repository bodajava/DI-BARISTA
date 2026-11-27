"use client";

import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard-error]", error.digest ?? "", error.message);
  }, [error]);
  return (
    <div className="adm-panel grid max-w-lg gap-3">
      <h1 className="text-xl font-bold">Something went wrong · حصلت مشكلة</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        {error.message}
        {error.digest ? ` (Ref: ${error.digest})` : ""}
      </p>
      <div>
        <button type="button" className="adm-btn" data-variant="primary" onClick={reset}>
          Try again · حاول تاني
        </button>
      </div>
    </div>
  );
}
