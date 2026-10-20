import { describe, expect, it, vi } from "vitest";
import { AccessError } from "@/server/authorization/engine";
import { createCandidateVision, readVisionMetadata, visionInput } from "@/server/nicejobs/candidate-vision";

vi.mock("@/server/portals/policy", () => ({ requirePortalAccess: vi.fn(async () => ({ divisionId: "career" })) }));

const vision = { outcome: "Learn customer conversations", reason: "Build confidence", nextStep: "Practice an introduction" };

describe("Nice Jobs personal vision", () => {
  it("reads only a valid personal goal and preserves unrelated profile metadata", () => {
    expect(readVisionMetadata(JSON.stringify({ authenticationRealm: "jobs", niceJobsVision: vision }))).toEqual(vision);
    expect(readVisionMetadata(JSON.stringify({ authenticationRealm: "jobs" }))).toBeNull();
    expect(readVisionMetadata("invalid json")).toBeNull();
    expect(visionInput.safeParse({ ...vision, targetIncome: 50000 }).success).toBe(false);
    expect(visionInput.safeParse({ ...vision, outcome: "x" }).success).toBe(false);
  });

  it("updates only the signed-in person's metadata and records an audit event", async () => {
    const metadata = JSON.stringify({ authenticationRealm: "jobs", contactStatus: "UNVERIFIED" });
    const db = {
      user: { findUnique: vi.fn(async () => ({ status: "ACTIVE", personId: "person-1", person: { status: "ACTIVE", metadata } })) },
      person: { updateMany: vi.fn(async (_args: { where: { id: string; metadata: string | null }; data: { metadata: string } }) => ({ count: 1 })) },
      auditEvent: { create: vi.fn(async () => ({})) }
    };
    const client = { $transaction: async (operation: (tx: typeof db) => Promise<unknown>) => operation(db) };
    const result = await createCandidateVision(client as never).save("signed-in-user", vision);
    expect(result).toEqual(vision);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "signed-in-user" }, select: expect.any(Object) });
    const update = db.person.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "person-1", metadata });
    expect(JSON.parse(update.data.metadata)).toEqual({ authenticationRealm: "jobs", contactStatus: "UNVERIFIED", niceJobsVision: vision });
    expect(db.auditEvent.create).toHaveBeenCalledOnce();
  });

  it("rejects inactive accounts before writing", async () => {
    const db = { user: { findUnique: vi.fn(async () => ({ status: "SUSPENDED", personId: "person-1", person: { status: "ACTIVE", metadata: "{}" } })) }, person: { updateMany: vi.fn() }, auditEvent: { create: vi.fn() } };
    const client = { $transaction: async (operation: (tx: typeof db) => Promise<unknown>) => operation(db) };
    await expect(createCandidateVision(client as never).save("signed-in-user", vision)).rejects.toBeInstanceOf(AccessError);
    expect(db.person.updateMany).not.toHaveBeenCalled();
  });
});
