import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  save: vi.fn(), requireAccess: vi.fn(), revalidate: vi.fn(),
  company: vi.fn(), brand: vi.fn(), authority: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/server/auth/guards", () => ({ requireSession: async () => ({ userId: "signed-in-boss" }) }));
vi.mock("@/server/authorization/engine", () => ({ AccessError: class AccessError extends Error {} }));
vi.mock("@/server/domain/business-service", () => ({ BusinessError: class BusinessError extends Error {}, businessService: { save: state.save } }));
vi.mock("@/server/group/boss-registry", () => ({ bossRegistry: { company: state.company, brand: state.brand } }));
vi.mock("@/server/group/boss-service", () => ({ bossService: { authority: state.authority } }));
vi.mock("@/server/security/diagnostics", () => ({ safeDiagnostic: () => "safe-reference" }));
import { saveBossHierarchyRecord } from "@/app/app/boss/hierarchy-actions";

function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  state.authority.mockResolvedValue({ ctx: { requireAccess: state.requireAccess }, root: { id: "group" } });
  state.company.mockResolvedValue({ row: { id: "profile-aira", organizationId: "aira", displayName: "AIRA", shortName: "AIRA", companyType: "PRIVATE", country: "IN", region: "Kerala", identifiers: '{"registration":"recorded"}', metadata: '{"review":"kept"}' } });
  state.brand.mockImplementation(async (_userId: string, id: string) => ({ row: { id, organizationId: id === "foreign" ? "other" : "aira", parentBrandId: "labs-parent", metadata: '{"review":"kept"}' } }));
  state.save.mockResolvedValue({ id: "saved" });
});

describe("Boss hierarchy management actions", () => {
  it("creates only an inactive company under the verified group, ignoring a client ACTIVE claim", async () => {
    const result = await saveBossHierarchyRecord({}, form({ kind: "company", name: "New company", slug: "new-company", legalName: "New Company Private Limited", status: "ACTIVE" }));
    expect(result.success).toBeTruthy();
    expect(state.requireAccess).toHaveBeenCalledWith("company.manage", { organizationId: "group" });
    expect(state.save).toHaveBeenCalledWith("signed-in-boss", "companies", expect.objectContaining({ groupOrganizationId: "group", status: "INACTIVE" }));
    expect(state.revalidate).toHaveBeenCalledOnce();
  });
  it("creates a sub-brand only under a brand in the same verified company", async () => {
    const result = await saveBossHierarchyRecord({}, form({ kind: "brand", organizationId: "aira", parentBrandId: "labs", name: "New division", slug: "new-division", status: "ACTIVE" }));
    expect(result.success).toBeTruthy();
    expect(state.company).toHaveBeenCalledWith("signed-in-boss", "aira");
    expect(state.save).toHaveBeenCalledWith("signed-in-boss", "brands", expect.objectContaining({ organizationId: "aira", parentBrandId: "labs", status: "INACTIVE" }), undefined);
  });
  it("denies a forged cross-company parent before any write", async () => {
    const result = await saveBossHierarchyRecord({}, form({ kind: "brand", organizationId: "aira", parentBrandId: "foreign", name: "Bad", slug: "bad" }));
    expect(result.error).toContain("unavailable");
    expect(state.save).not.toHaveBeenCalled();
  });
  it("preserves recorded company fields on a focused edit and verifies profile identity", async () => {
    const result = await saveBossHierarchyRecord({}, form({ kind: "company", organizationId: "aira", recordId: "profile-aira", name: "AIRA", slug: "aira-skill-city", legalName: "AIRA Skill City Private Limited", status: "ACTIVE" }));
    expect(result.success).toBeTruthy();
    expect(state.save).toHaveBeenCalledWith("signed-in-boss", "companies", expect.objectContaining({ country: "IN", region: "Kerala", identifiers: { registration: "recorded" }, metadata: { review: "kept" } }), "profile-aira");
    const denied = await saveBossHierarchyRecord({}, form({ kind: "company", organizationId: "aira", recordId: "other-profile", name: "AIRA", slug: "aira-skill-city" }));
    expect(denied.error).toContain("unavailable");
    expect(state.save).toHaveBeenCalledTimes(1);
  });
  it("ignores a forged parent change while editing an existing brand", async () => {
    const result = await saveBossHierarchyRecord({}, form({ kind: "brand", organizationId: "aira", recordId: "existing", parentBrandId: "foreign", name: "Existing", slug: "existing", status: "ACTIVE" }));
    expect(result.success).toBeTruthy();
    expect(state.save).toHaveBeenCalledWith("signed-in-boss", "brands", expect.objectContaining({ parentBrandId: "labs-parent", metadata: { review: "kept" } }), "existing");
  });
});
