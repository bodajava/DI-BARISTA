"use client";

/**
 * Web push for staff devices through Firebase Cloud Messaging.
 * Needs NEXT_PUBLIC_FIREBASE_* (web app config) + NEXT_PUBLIC_FIREBASE_VAPID_KEY, and the
 * service worker at /firebase-messaging-sw.js (served by a route handler with the same config).
 */
import { api } from "./api";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const TOKEN_KEY = "dib_admin_push_token";

export type PushState = "unsupported" | "not-configured" | "blocked" | "off" | "on";

export function pushConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.messagingSenderId && VAPID);
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (!pushConfigured()) return "not-configured";
  const { isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    return localStorage.getItem(TOKEN_KEY) && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

async function messaging() {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging } = await import("firebase/messaging");
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getMessaging(app);
}

export async function enablePush(locale: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const { getToken } = await import("firebase/messaging");
  const token = await getToken(await messaging(), { vapidKey: VAPID, serviceWorkerRegistration: registration });
  await api("notifications/devices", { method: "POST", body: { token, audience: "STAFF", locale } });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
  return "on";
}

export async function disablePush(): Promise<PushState> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (token) {
    await api("notifications/devices", { method: "DELETE", body: { token } }).catch(() => undefined);
    const { deleteToken } = await import("firebase/messaging");
    await deleteToken(await messaging()).catch(() => undefined);
  }
  return "off";
}

/** Messages that arrive while the dashboard is open */
export async function onForegroundPush(handler: (data: Record<string, string>) => void): Promise<() => void> {
  if (!pushConfigured() || (await pushState()) !== "on") return () => undefined;
  const { onMessage } = await import("firebase/messaging");
  return onMessage(await messaging(), (payload) => handler((payload.data ?? {}) as Record<string, string>));
}
