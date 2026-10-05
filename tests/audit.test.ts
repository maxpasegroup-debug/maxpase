import { describe, expect, it } from "vitest";
import { buildAuditEventData } from "@/server/audit/audit-service";

describe("audit foundation", () => {
  it("builds auditable actor, scope, entity, and result data", () => {
    const event = buildAuditEventData({
      actorUserId: "user-1",
      actorPersonId: "person-1",
      organizationId: "org-1",
      action: "company.create",
      entityType: "CompanyProfile",
      entityId: "company-1",
      result: "SUCCESS",
      metadata: { source: "test" }
    });

    expect(event.action).toBe("company.create");
    expect(event.result).toBe("SUCCESS");
    expect(event.actorUser).toEqual({ connect: { id: "user-1" } });
    expect(event.organization).toEqual({ connect: { id: "org-1" } });
  });
});
