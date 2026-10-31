import { describe, expect, it } from "vitest";
import { buildBrandReport } from "@/server/group/brand-reporting";

const now = new Date("2026-10-30T12:00:00Z");
const base = { brandId: "startup", startupConfigured: true, projects: [], products: [], programs: [], admissions: [], campaigns: [], commercial: [], overdueTasks: [], calculatedAt: now };
const find = (key: string, input: Parameters<typeof buildBrandReport>[0]) => buildBrandReport(input).find(row => row.key === key)!;

describe("Brand operating report coverage", () => {
  it("links Skill Studio programme counts to its own recorded section", () => {
    const studio = { ...base, startupConfigured: false, studioConfigured: true, programsHref: "#studio-programs" };
    expect(find("programs", studio)).toMatchObject({ value: 0, href: "#studio-programs" });
    expect(find("programs", { ...studio, programs: null })).toMatchObject({ value: null, href: null, coverage: "Not authorized" });
  });
  it("distinguishes zero connected records from unauthorized or unlinked sources", () => {
    expect(find("admissions", base)).toMatchObject({ value: 0, href: "/app/boss/brands/startup/admissions", freshness: "No recorded updates" });
    expect(find("admissions", { ...base, admissions: null })).toMatchObject({ value: null, href: null, freshness: "Unavailable" });
    expect(find("sales", base)).toMatchObject({ value: null, href: null });
    expect(find("people", base).coverage).toContain("does not establish brand assignment");
    expect(find("admissions", { ...base, startupConfigured: false, admissions: null }).coverage).toBe("No verified Startup Skool division");
  });
  it("links recorded review decisions and labels old evidence", () => {
    const old = new Date("2026-10-01T12:00:00Z");
    const admissions = [{ status: "IN_REVIEW", _count: { _all: 3 }, _max: { updatedAt: old } }, { status: "APPROVED", _count: { _all: 2 }, _max: { updatedAt: old } }];
    expect(find("admissions", { ...base, admissions })).toMatchObject({ value: 5, freshness: "Last update over 7 days ago" });
    expect(find("admissionReviews", { ...base, admissions })).toMatchObject({ value: 3, href: "/app/boss/brands/startup/admissions?status=IN_REVIEW" });
    const campaigns = [{ status: "IN_REVIEW", _count: { _all: 1 }, _max: { updatedAt: now } }];
    expect(find("campaignReviews", { ...base, campaigns })).toMatchObject({ value: 1, href: "/app/boss/brands/startup/marketing?status=IN_REVIEW", freshness: "Updated within 7 days" });
  });
  it("counts only shown source records and flags truncated coverage", () => {
    const projects = Array.from({ length: 51 }, (_, i) => ({ status: i === 0 ? "BLOCKED" : "ACTIVE", updatedAt: now }));
    expect(find("projects", { ...base, projects })).toMatchObject({ value: 50, href: "#projects" });
    expect(find("projects", { ...base, projects }).coverage).toContain("more records exist");
    expect(find("blocked", { ...base, projects }).value).toBe(1);
    expect(find("overdue", { ...base, overdueTasks: null })).toMatchObject({ value: null, href: null });
    const campaigns = [{ status: "IN_REVIEW", _count: { _all: 130 }, _max: { updatedAt: now } }];
    expect(find("campaigns", { ...base, campaigns })).toMatchObject({ value: 100 });
    expect(find("campaigns", { ...base, campaigns }).coverage).toContain("more records exist");
  });
});
