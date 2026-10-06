export const timezoneOptions = [
  { value: "Asia/Kolkata", label: "India Standard Time (IST)" }, { value: "UTC", label: "Coordinated Universal Time (UTC)" },
  { value: "Asia/Dubai", label: "Dubai" }, { value: "Asia/Singapore", label: "Singapore" }, { value: "Europe/London", label: "London" },
  { value: "America/New_York", label: "New York" }, { value: "America/Los_Angeles", label: "Los Angeles" }, { value: "Australia/Sydney", label: "Sydney" }
];
export function isTimezone(value: string) {
  if (value.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en-IN", { timeZone: value }).format(0); return true; } catch { return false; }
}
export function timezoneLabel(value: string) { return ["Asia/Kolkata", "Asia/Calcutta"].includes(value) ? "IST" : value === "UTC" ? "UTC" : value.replaceAll("_", " "); }
export function formatUserTime(value: Date | string, timezone: string) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IN", { timeZone: isTimezone(timezone) ? timezone : "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).format(instant);
}
