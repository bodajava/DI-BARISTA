"use client";

/** "Last N days", rounded to the minute so query keys stay stable while the page is open */
export function lastDays(days: number): { fromDate: string; toDate: string } {
  const to = new Date();
  to.setSeconds(0, 0);
  const from = new Date(to.getTime() - days * 86400000);
  return { fromDate: from.toISOString(), toDate: to.toISOString() };
}

export function deltaTrend(change: number | null | undefined): "up" | "down" | "flat" {
  if (change === null || change === undefined || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}
