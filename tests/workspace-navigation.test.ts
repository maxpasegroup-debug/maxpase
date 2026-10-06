import { describe, expect, it } from "vitest";
import { bossViews, groupForPath, groupForView, navigationBossHref, workspaceGroups, workspaceHref } from "@/lib/workspace-navigation";
import { formatUserTime, isTimezone } from "@/lib/timezone";
import { statusTone } from "@/lib/status";
describe("Manager navigation and presentation", () => {
  it("places every Boss destination in exactly one of six groups", () => {
    expect(workspaceGroups.map(g => g.label)).toEqual(["Overview", "Companies", "Work", "Decisions", "People", "System"]);
    const views = workspaceGroups.flatMap(g => g.views);
    expect(new Set(views).size).toBe(17);
    expect([...views].sort()).toEqual(Object.keys(bossViews).sort());
    for (const view of views) expect(groupForView(view).views).toContain(view);
    for (const group of workspaceGroups) for (const destination of group.modules) expect(groupForPath(destination.href).key).toBe(group.key);
  });
  it("preserves company and all six filters without accepting external return destinations", () => {
    const query = new URLSearchParams({ companyId: "company", projectId: "project", productId: "product", from: "2026-10-01", until: "2026-10-06", status: "ACTIVE", severity: "HIGH", returnUrl: "https://evil.invalid" });
    const target = new URL(navigationBossHref("goals", query), "https://test.invalid");
    expect(target.pathname).toBe("/app/boss");
    expect(target.searchParams.get("view")).toBe("goals");
    for (const key of ["companyId", "projectId", "productId", "from", "until", "status", "severity"]) expect(target.searchParams.get(key)).toBe(query.get(key));
    expect(target.searchParams.has("returnUrl")).toBe(false);
    expect(navigationBossHref("https://evil.invalid", query)).toContain("view=overview");
    expect(workspaceHref("/app/execution/projects", "company", "projects")).toBe("/app/execution/projects?organizationId=company&companyId=company&returnView=projects&bossCompanyId=company");
    const drilldown = new URL(workspaceHref("/app/operations/my-tasks", "company", "projects", query), "https://test.invalid");
    expect(drilldown.searchParams.has("status")).toBe(false);
    expect(drilldown.searchParams.get("bossStatus")).toBe("ACTIVE");
    drilldown.searchParams.set("status", "TODO");
    drilldown.searchParams.set("organizationId", "another-company");
    const restored = new URL(navigationBossHref("projects", drilldown.searchParams), "https://test.invalid");
    expect(restored.searchParams.get("status")).toBe("ACTIVE");
    expect(restored.searchParams.get("companyId")).toBe("company");
    const registry = new URL(workspaceHref("/app/business/companies", "company", "companies", query), "https://test.invalid");
    expect(registry.searchParams.has("organizationId")).toBe(false);
    expect(registry.searchParams.get("bossCompanyId")).toBe("company");
    const people = new URL(workspaceHref("/app/workforce/people", "company", "people", query), "https://test.invalid");
    expect(people.searchParams.get("organization")).toBe("company");
  });
  it("formats the same instant in the selected timezone, including DST and day boundaries", () => {
    const instant = "2024-01-01T22:00:00.000Z";
    expect(formatUserTime(instant, "Asia/Kolkata")).toContain("02 Jan 2024");
    expect(formatUserTime(instant, "UTC")).toContain("01 Jan 2024");
    expect(formatUserTime("2024-07-01T12:00:00Z", "America/New_York")).toContain("08:00");
    expect(formatUserTime("2024-01-01T12:00:00Z", "America/New_York")).toContain("07:00");
    expect(formatUserTime(instant, "invalid")).toBe(formatUserTime(instant, "UTC"));
    expect(formatUserTime("not-a-date", "UTC")).toBe("Unavailable");
    expect(isTimezone("Asia/Kolkata")).toBe(true);
    expect(isTimezone("../Asia/Kolkata")).toBe(false);
  });
  it("does not give unknown, unverified or empty status a success color", () => {
    for (const value of ["NO_RECORDED_WORK", "NOT AUTHORIZED", "NOT VERIFIED", "NOT CONFIGURED", "UNAVAILABLE"]) expect(statusTone(value)).toBe("neutral");
    expect(statusTone("LIMITED_COVERAGE")).toBe("warning");
    expect(statusTone("BLOCKED")).toBe("danger");
    expect(statusTone("ACTIVE")).toBe("success");
  });
});
