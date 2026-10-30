import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const access = vi.hoisted(() => ({ companyId: "aira-company", allowManage: false }));
vi.mock("@/server/portals/policy", () => ({ requirePortalAccess: async () => ({ companyId: access.companyId, ctx: { user: { personId: "director" }, requireAccess: async () => {}, decide: async (key: string) => ({ allowed: access.allowManage && key === "task.manage" }) } }) }));
vi.mock("@/server/group/boss-service", () => ({ createBossService: () => ({ authority: async () => { throw new Error("Boss identity must not be used for Skill City"); } }) }));

import { campaignReady, canDecideCampaign, createBrandMarketing, parseCampaignPayload } from "@/server/group/brand-marketing";
import { brandOperatingModules } from "@/server/group/brand-os";
import { marketingDivisionSlug } from "@/server/group/brand-marketing-scope";

const payload = { brandId: "brand-1", objective: "Introduce the programme to interested people", channel: "SOCIAL", startsAt: "2030-01-01T10:00:00+05:30", endsAt: "2030-01-02T10:00:00+05:30", preparedByUserId: "preparer", assets: [{ id: "ed388b1a-99f5-49ad-8413-5411a5b1905a", kind: "COPY", title: "Draft caption", body: "A draft explanation for internal review" }], schemaVersion: 1 };
describe("Brand marketing planning boundary", () => {
  it("requires owner, future schedule and draft content before review", () => {
    const parsed = parseCampaignPayload(JSON.stringify(payload));
    expect(campaignReady({ ownerPersonId: "owner", payload: parsed }, new Date("2029-01-01"))).toBe(true);
    expect(campaignReady({ ownerPersonId: "", payload: parsed }, new Date("2029-01-01"))).toBe(false);
    expect(campaignReady({ ownerPersonId: "owner", payload: { ...parsed, assets: [] } }, new Date("2029-01-01"))).toBe(false);
    expect(campaignReady({ ownerPersonId: "owner", payload: parsed }, new Date("2031-01-01"))).toBe(false);
    expect(() => parseCampaignPayload(JSON.stringify({ ...payload, published: true }))).toThrow("unavailable");
  });
  it("requires an independent current-version decision", () => {
    const row = { status: "IN_REVIEW", version: 3, ownerPersonId: "owner" };
    expect(canDecideCampaign(row, "reviewer", "preparer", 3)).toBe(true);
    expect(canDecideCampaign(row, "owner", "preparer", 3)).toBe(false);
    expect(canDecideCampaign(row, "preparer", "preparer", 3)).toBe(false);
    expect(canDecideCampaign(row, "reviewer", "preparer", 2)).toBe(false);
    expect(canDecideCampaign({ ...row, status: "APPROVED" }, "reviewer", "preparer", 3)).toBe(false);
  });
  it("shows a brand destination only when the server supplied an authorized link", () => {
    const base = { startup: true, programs: true, products: false, projects: false, people: false, approvals: false };
    expect(brandOperatingModules(base).find(module => module.key === "marketing")?.href).toBeNull();
    expect(brandOperatingModules({ ...base, marketingHref: "/app/boss/brands/brand-1/marketing" }).find(module => module.key === "marketing")?.href).toBe("/app/boss/brands/brand-1/marketing");
  });
  it("uses verified parent-brand mappings for division-scoped marketing", () => {
    expect(marketingDivisionSlug("my-solar-solutions", "aira-labs")).toBe("aira-labs");
    expect(marketingDivisionSlug("nice-jobs", "aira-career-hub")).toBe("aira-career-hub");
    expect(marketingDivisionSlug("teachx-guru")).toBeUndefined();
  });
  it("does not query campaigns when a Skill City account selects another company's brand", async () => {
    const findMany = vi.fn(async () => []);
    const client = { brand: { findUnique: async () => ({ id: "foreign-brand", name: "Foreign", slug: "foreign", status: "ACTIVE", organizationId: "foreign-company", parentBrand: null, organization: { slug: "foreign", type: "COMPANY", parentId: "group", status: "ACTIVE", company: { status: "ACTIVE" } } }) }, executiveRecord: { findMany } } as unknown as PrismaClient;
    await expect(createBrandMarketing(client).list("employee", "foreign-brand", "SKILLCITY")).rejects.toThrow("Brand marketing unavailable");
    expect(findMany).not.toHaveBeenCalled();
  });
  it("filters even an authorized company's campaigns by stable brand source key", async () => {
    const findMany = vi.fn(async () => []);
    const client = { brand: { findUnique: async () => ({ id: "brand-1", name: "Skill City", slug: "aira-skill-city", status: "ACTIVE", organizationId: "aira-company", parentBrand: null, organization: { slug: "aira-skill-city", type: "COMPANY", parentId: "group", status: "ACTIVE", company: { status: "ACTIVE" } } }) }, executiveRecord: { findMany }, person: { findMany: vi.fn(async () => []) } } as unknown as PrismaClient;
    const result = await createBrandMarketing(client).list("employee", "brand-1", "SKILLCITY", { status: "DRAFT", search: "  plan  " });
    expect(result.rows).toEqual([]);
    expect(result.canPlan).toBe(false);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "aira-company", kind: "BRAND_MARKETING_CAMPAIGN", sourceKey: { startsWith: "marketing:campaign:brand-1:" }, status: "DRAFT", title: { contains: "plan", mode: "insensitive" } }) }));
  });
  it("does not create a campaign when the employee lacks planning permission", async () => {
    const create = vi.fn();
    const client = { brand: { findUnique: async () => ({ id: "brand-1", name: "Skill City", slug: "aira-skill-city", status: "ACTIVE", organizationId: "aira-company", parentBrand: null, organization: { slug: "aira-skill-city", type: "COMPANY", parentId: "group", status: "ACTIVE", company: { status: "ACTIVE" } } }) }, executiveRecord: { create }, $transaction: async (fn: (db: unknown) => Promise<unknown>) => fn(client) } as unknown as PrismaClient;
    await expect(createBrandMarketing(client).save("employee", "brand-1", "SKILLCITY", { title: "Launch plan", objective: "Introduce the programme to interested people", channel: "SOCIAL", ownerPersonId: null, startsAt: null, endsAt: null, reference: "ed388b1a-99f5-49ad-8413-5411a5b1905a" })).rejects.toThrow("Campaign planning unavailable");
    expect(create).not.toHaveBeenCalled();
  });
});
