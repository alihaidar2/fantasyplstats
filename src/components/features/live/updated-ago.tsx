"use client";

import * as React from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(timer);
}

/** The current minute, so the snapshot stays the same between ticks. */
const currentMinute = () => Math.floor(Date.now() / MINUTE);

/** "12 minutes ago" for a timestamp. */
export function formatAgo(iso: string, nowMinute: number): string {
  const minutes = Math.max(0, nowMinute - Math.floor(new Date(iso).getTime() / MINUTE));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

/**
 * How long ago the data was fetched, in the visitor's browser. The static
 * HTML (and hydration) render nothing, since the build can't know when the
 * page is read.
 */
export function UpdatedAgo({ iso, className }: { iso: string; className?: string }) {
  const minute = React.useSyncExternalStore(subscribe, currentMinute, () => null);
  if (minute === null) return null;
  return <span className={className}>({formatAgo(iso, minute)})</span>;
}
