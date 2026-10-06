"use client";
import { createContext, useContext } from "react";
import { formatUserTime } from "@/lib/timezone";
export const TimezoneContext = createContext("UTC");
export function UserTime({ value, empty = "Not recorded" }: { value: Date | string | null | undefined; empty?: string }) {
  const timezone = useContext(TimezoneContext);
  if (!value) return <span>{empty}</span>;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return <span>Unavailable</span>;
  return <time dateTime={instant.toISOString()} title={`${instant.toISOString()} / ${timezone}`}>{formatUserTime(instant, timezone)}</time>;
}
