import { describe, expect, it } from "vitest";
import { filterValues, restoreFilter, savedFilterList, savedFilterStorageKey, sortWork, withinOrganization } from "@/lib/work-list";
import { sortedResultPage } from "@/server/domain/query-bounds";
import { workspaceHref } from "@/lib/workspace-navigation";

describe("Operational work-list controls", () => {
  it("keeps target selection in the current company subtree without assuming missing ancestry or following cycles", () => {
    const nodes = [{ id: "division", parentId: "company" }, { id: "foreign", parentId: "other" }, { id: "loop", parentId: "loop" }];
    expect(withinOrganization("division", "company", nodes)).toBe(true);
    expect(withinOrganization("company", "company", [])).toBe(true);
    expect(withinOrganization("foreign", "company", nodes)).toBe(false);
    expect(withinOrganization("unknown", "company", nodes)).toBe(false);
    expect(withinOrganization("loop", "company", nodes)).toBe(false);
  });
  const rows = [{ id: "a", title: "Zulu", createdAt: new Date("2026-01-02Z"), dueDate: null }, { id: "b", title: "Alpha", createdAt: new Date("2026-01-01Z"), dueDate: new Date("2026-01-03Z") }, { id: "c", title: "Beta", createdAt: new Date("2026-01-02Z"), dueDate: new Date("2026-01-02Z") }];
  it("orders the full authorized result before pagination, with deterministic ties and missing dates last", () => {
    expect(sortWork(rows, "newest").map(r => r.id)).toEqual(["a", "c", "b"]);
    const first = sortedResultPage(rows, "deadline", { limit: 1 });
    expect(first.records[0].id).toBe("c");
    const second = sortedResultPage(rows, "deadline", { limit: 1, after: first.nextCursor! });
    expect(second.records[0].id).toBe("b");
    expect(sortedResultPage(rows, "deadline", { after: second.nextCursor! }).records[0].id).toBe("a");
    expect(sortedResultPage(rows, "title").records.map(r => r.id)).toEqual(["b", "c", "a"]);
    expect(sortedResultPage(rows, "title", { after: "foreign-cursor" }).records).toEqual([]);
    expect(() => sortWork(rows, "forged")).toThrow();
  });
  it("saves only bounded filter inputs, never actor authority, credentials, return URLs or cursors", () => {
    const filters = filterValues(new URLSearchParams("status=PENDING&sort=newest&actorIdentity=forged&pin=secret&cursor=next&returnView=overview&bossStatus=ACTIVE"));
    expect(filters).toEqual({ status: "PENDING", sort: "newest" });
    expect(savedFilterList.safeParse([{ name: "Mine", filters: { actorIdentity: "forged" } }]).success).toBe(false);
    expect(savedFilterList.safeParse(Array.from({ length: 11 }, () => ({ name: "Extra", filters: {} }))).success).toBe(false);
    const key = (user: string, company: string) => savedFilterStorageKey(user, "/app/operations/approvals", new URLSearchParams({ companyId: company }));
    expect(key("manager", "aira")).not.toBe(key("manager", "pearn"));
    expect(key("manager", "aira")).not.toBe(key("other-manager", "aira"));
    const restored = restoreFilter(new URLSearchParams("returnView=projects&bossCompanyId=company&bossStatus=ACTIVE&cursor=next&create=true&recordId=old&status=TODO"), { status: "COMPLETED", sort: "newest" });
    expect(Object.fromEntries(restored)).toEqual({ returnView: "projects", bossCompanyId: "company", bossStatus: "ACTIVE", status: "COMPLETED", sort: "newest" });
  });
  it("preserves the exact record scope without duplicate parameters, and keeps the Boss company return", () => {
    const url = new URL(workspaceHref("/app/execution/tasks?recordId=task&organizationId=division", "company", "overview", new URLSearchParams("status=ACTIVE")), "https://test.invalid");
    expect(url.searchParams.getAll("organizationId")).toEqual(["division"]);
    expect(url.searchParams.get("recordId")).toBe("task");
    expect(url.searchParams.get("bossCompanyId")).toBe("company");
    expect(url.searchParams.get("bossStatus")).toBe("ACTIVE");
    expect(url.searchParams.has("status")).toBe(false);
  });
});
