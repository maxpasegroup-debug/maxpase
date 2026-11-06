export const lifecycleStatuses = ["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "CLOSED", "RETIRED", "ARCHIVED"] as const;
export function allowedStartupChange(current: string, next: string): boolean {
  return current === "DRAFT" && next === "PLANNED" || current === "PLANNED" && next === "DRAFT" || current === "ACTIVE" && next === "PAUSED" || ["ACTIVE", "PAUSED", "PLANNED"].includes(current) && next === "CLOSED" || current !== "ARCHIVED" && next === "ARCHIVED";
}
