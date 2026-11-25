"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/admin/types";

export const SessionContext = createContext<SessionUser | null>(null);

export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession must be used inside the dashboard shell");
  return user;
}

/** Catalog, settings, coupons, refunds, marketing */
export function useIsAdmin(): boolean {
  const user = useSession();
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}
