import { describe, expect, it } from "vitest";
import { niceJobsControlGroups, niceJobsControlGroup, niceJobsControlHref, isNiceJobsControlView, niceJobsControlRecordHref } from "@/lib/nicejobs-control-navigation";
import { workforcePermissions } from "@/server/authorization/registry";
import { automationProvenance } from "@/server/nicejobs/automation-provenance";

describe("Nice Jobs focused management navigation", () => {
  it("groups existing lifecycle work in six sections without manufacturing capabilities", () => {
    expect(niceJobsControlGroups.map(g => g.label)).toEqual(["Overview", "Opportunities", "Applicants", "Workforce", "Earnings", "System"]);
    for (const g of niceJobsControlGroups) for (const [, , permission] of g.entries) expect(workforcePermissions.some(p => p.key === permission)).toBe(true);
    expect(niceJobsControlGroup("worker-detail")).toBe("workforce");
    expect(niceJobsControlGroup("finance-incentive-detail")).toBe("earnings");
    expect(niceJobsControlGroup("automation-detail")).toBe("system");
    for (const participant of ["my-day", "my-work", "worker-reports", "worker-wallet", "worker-resources", "worker-help", "my-onboarding", "my-applications"]) expect(niceJobsControlGroup(participant)).toBeNull();
    expect(isNiceJobsControlView("lead-detail", {})).toBe(false);
    expect(isNiceJobsControlView("lead-detail", { control: "boss" })).toBe(true);
    expect(isNiceJobsControlView("knowledge-detail", {})).toBe(false);
    expect(isNiceJobsControlView("knowledge-detail", { management: "true" })).toBe(true);
    expect(isNiceJobsControlView("work-sops", {})).toBe(false);
  });
  it("retains company and division without leaking record IDs or stale filters across sections", () => {
    const href = niceJobsControlHref("/sites/jobs/gateway", "applications", { companyId: "company", divisionId: "division", assignmentId: "private-worker", status: "ACTIVE", cursor: "old-page", view: "worker-detail", actorUserId: "forged" });
    expect(href).toBe("/sites/jobs/gateway?view=applications&companyId=company&divisionId=division");
    expect(niceJobsControlHref("/app/nicejobs", "finance-wallets", { divisionId: ["forged", "scope"] })).toBe("/app/nicejobs?view=finance-wallets");
    expect(niceJobsControlRecordHref("/sites/jobs/gateway", "/app/nicejobs?view=lead-detail&leadId=source&divisionId=division", "company")).toBe("/sites/jobs/gateway?view=lead-detail&leadId=source&divisionId=division&companyId=company&control=boss");
    expect(niceJobsControlRecordHref("/sites/jobs/gateway", "https://outside.invalid/redirect", "company")).toBeNull();
    expect(niceJobsControlRecordHref("/sites/jobs/gateway", "/app/communications", "company")).toBeNull();
  });
});
describe("Recorded automation execution authority", () => {
  const data = { resultId: "result", processorUserId: "human-processor", ownerUserId: "rule-owner", action: "NOTIFY_OWNER", requiredPermission: "notification.generate", workflowVersionId: "published-version" };
  it("separates processor from rule owner, binds the result and hides account IDs without user-read authority", () => {
    expect(automationProvenance(JSON.stringify(data), "result", "published-version", true)).toMatchObject({ processorUserId: "human-processor", ownerUserId: "rule-owner" });
    expect(automationProvenance(JSON.stringify(data), "result", "published-version", false)).toMatchObject({ processorUserId: null, ownerUserId: null, action: "NOTIFY_OWNER" });
    expect(automationProvenance(JSON.stringify(data), "altered", "published-version", true)).toBeNull();
    expect(automationProvenance(JSON.stringify(data), "result", "altered", true)).toBeNull();
  });
  it("does not invent authority for legacy, malformed or high-impact execution evidence", () => {
    expect(automationProvenance('{"resultId":"result"}', "result", null, true)).toBeNull();
    expect(automationProvenance("not-json", null, null, true)).toBeNull();
    expect(automationProvenance(JSON.stringify({ ...data, action: "ISSUE_OFFER" }), "result", "published-version", true)).toBeNull();
  });
});
