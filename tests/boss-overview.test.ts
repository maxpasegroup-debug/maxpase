import { describe, expect, it } from "vitest";
import { buildBossOverview, domainEvidence, inventoryHref, overviewHref, overviewKey, overviewSelection } from "@/server/group/boss-overview";
import type { createExecutiveService } from "@/server/domain/executive-service";
type Snapshot = Awaited<ReturnType<ReturnType<typeof createExecutiveService>["dashboard"]>>;
const now = new Date("2026-10-06T20:00:00Z");
function row(id: string, type = "TASK", extras: Record<string, unknown> = {}) { return { id, type, title: id, status: "TODO", organizationId: "company", projectId: null, ownerPersonId: null, priority: "NORMAL", dueAt: new Date("2026-10-05T00:00:00Z"), createdAt: now, updatedAt: now, ...extras }; }
function fixture(extra: Record<string, unknown> = {}) { return { calculatedAt: now, tasks: [], projects: [], goals: [], blockers: [], milestones: [], decisions: [], records: [], deadlines: [], operations: {}, attention: [], changes: [], metrics: [], options: { people: [] }, ...extra } as unknown as Snapshot; }
describe("Executive overview authorized projections", () => {
  it("prioritizes severity then permitted human decisions and deduplicates overlapping work", () => {
    const task = row("critical", "TASK", { priority: "CRITICAL" });
    const approval = row("approval", "APPROVAL", { status: "PENDING", actionable: true, priority: "HIGH", dueAt: new Date("2026-10-08") });
    const blocked = row("project", "PROJECT", { status: "BLOCKED" });
    const data = buildBossOverview(fixture({ tasks: [task, row("ordinary")], projects: [blocked], decisions: [approval] }), "Asia/Kolkata");
    expect(data.urgent.map(r => r.row.id)).toEqual(["critical", "approval", "project", "ordinary"]);
    expect(data.urgent.filter(r => r.row.id === "project")).toHaveLength(1);
    expect(data.queues.blockers.map(r => r.id)).toEqual(["project"]);
  });
  it("never presents waiting, expired or non-designated decisions as actionable", () => {
    const data = buildBossOverview(fixture({ decisions: [row("waiting", "APPROVAL", { status: "PENDING", actionable: false, dueAt: null }), row("expired", "APPROVAL", { status: "PENDING" }), row("other", "DECISION", { status: "PENDING" })], records: [{ id: "other", canDecide: false }] }), "UTC");
    expect(data.canAct(data.queues.approvals[0])).toBe(false);
    expect(data.nextAction(data.queues.approvals.find(r => r.id === "waiting")!)).toContain("Waiting for policy");
    expect(data.nextAction(data.queues.approvals.find(r => r.id === "expired")!)).toContain("expiry reached");
    expect(data.nextAction(data.queues.decisions[0])).toContain("designated decision maker");
  });
  it("excludes closed work, includes standalone blockers and overdue milestones", () => {
    const data = buildBossOverview(fixture({ tasks: [row("done", "TASK", { status: "COMPLETED" }), row("cancelled", "TASK", { status: "CANCELLED" })], milestones: [row("milestone", "MILESTONE")], blockers: [row("open", "BLOCKER", { status: "OPEN" }), row("resolved", "BLOCKER", { status: "RESOLVED" })] }), "UTC");
    expect(data.queues.overdue.map(r => r.id)).toEqual(["milestone"]);
    expect(data.queues.blockers.map(r => r.id)).toEqual(["open"]);
    const goal = row("missed-goal", "GOAL", { status: "MISSED", severity: "HIGH", handlingStatus: "NEW" });
    const concern = buildBossOverview(fixture({ goals: [goal], attention: [goal] }), "UTC");
    expect(concern.queues.overdue).toEqual([]);
    expect(concern.queues.concerns.map(r => r.id)).toEqual(["missed-goal"]);
    expect(concern.urgent[0].row.id).toBe("missed-goal");
  });
  it("uses the account timezone for today's briefing and does not invent an owner", () => {
    const snap = fixture({ changes: [{ id: "today", createdAt: now }, { id: "yesterday", createdAt: new Date("2026-10-06T17:00:00Z") }], options: { people: [{ id: "visible", name: "Visible owner" }] } });
    const data = buildBossOverview(snap, "Asia/Kolkata");
    expect(data.changesToday.map(c => c.id)).toEqual(["today"]);
    expect(buildBossOverview(snap, "UTC").changesToday).toHaveLength(2);
    expect(data.owner(row("none") as Snapshot["tasks"][number])).toBe("Owner not recorded");
    expect(data.owner(row("hidden", "TASK", { ownerPersonId: "hidden" }) as Snapshot["tasks"][number])).toContain("outside visible");
    expect(data.owner(row("visible", "TASK", { ownerPersonId: "visible" }) as Snapshot["tasks"][number])).toBe("Visible owner");
  });
  it("separates a measured zero from missing source access and keeps drill-down selection exact", () => {
    expect(buildBossOverview(fixture(), "UTC").coverage.approvals).toBe(false);
    const data = buildBossOverview(fixture({ metrics: [{ source: "APPROVAL", value: 0 }], tasks: [row("one"), row("two")] }), "UTC");
    expect(data.coverage.approvals).toBe(true); expect(data.queues.approvals).toEqual([]);
    const href = new URL(overviewHref("overdue", "company", overviewKey(data.queues.overdue[0])), "https://test.invalid");
    expect(href.searchParams.get("companyId")).toBe("company");
    expect(data.queues.overdue.filter(r => overviewKey(r) === href.searchParams.get("item"))).toHaveLength(1);
    for (const input of [{ queue: "forged" }, { queue: ["overdue"] }, { item: "one" }, { inventory: "forged" }, { inventory: "tasks", queue: "overdue" }]) expect(() => overviewSelection.parse(input)).toThrow();
    const inventory = new URL(inventoryHref("tasks", "company", { status: "ACTIVE", from: "2026-10-01" }), "https://test.invalid");
    expect(Object.fromEntries(inventory.searchParams)).toEqual({ view: "overview", inventory: "tasks", companyId: "company", status: "ACTIVE", from: "2026-10-01" });
  });
});
describe("Recorded domain evidence is not live verification", () => {
  it("links known application routing without inferring ownership or certificates", () => {
    const data = domainEvidence("https://airalabs.online", null, now);
    expect(data.route).toBe("AIRA Labs"); expect(data.ownership).toBe("NOT RECORDED"); expect(data.routing).toBe("NOT RECORDED"); expect(data.certificate).toBe("NOT RECORDED");
    expect(domainEvidence("https://maxpase.com.attacker.invalid", null, now).route).toBeNull();
    expect(domainEvidence("javascript:alert(1)", null, now).hostname).toBeNull();
  });
  it("rejects malformed, mismatched and future claims; marks stale and expired recorded evidence", () => {
    const evidence = { hostname: "airalabs.online", ownership: { source: "Registrar record", checkedAt: "2026-09-01T00:00:00Z" }, routing: { source: "DNS check", checkedAt: "2090-01-01T00:00:00Z" }, certificate: { source: "TLS check", checkedAt: "2026-10-05T00:00:00Z", validUntil: "2026-10-06T00:00:00Z", issuer: "Recorded CA" } };
    const data = domainEvidence("https://airalabs.online", JSON.stringify({ domainEvidence: evidence }), now);
    expect(data.ownership).toContain("STALE"); expect(data.routing).toContain("FUTURE"); expect(data.certificate).toContain("EXPIRED");
    expect(domainEvidence("https://nicejobs.online", JSON.stringify({ domainEvidence: evidence }), now).evidence).toBeNull();
    expect(domainEvidence("https://airalabs.online", "{invalid", now).evidence).toBeNull();
    evidence.ownership.checkedAt = "2026-10-06T00:00:00Z";
    expect(domainEvidence("https://airalabs.online", JSON.stringify({ domainEvidence: evidence }), now).ownership).toContain("NOT INDEPENDENTLY VERIFIED");
  });
});
