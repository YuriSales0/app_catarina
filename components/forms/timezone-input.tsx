"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Hidden input carrying the browser's timezone, so lesson days line up with the family's calendar. */
export function TimezoneInput({ name = "timezone", fallback = "America/Sao_Paulo" }: { name?: string; fallback?: string }) {
  const tz = useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || fallback,
    () => fallback,
  );
  return <input type="hidden" name={name} value={tz} />;
}
