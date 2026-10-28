import type { Prisma } from "@prisma/client";

// Release manifest: update alongside an intentional migration, never by inspecting the live database.
export const migrationManifest = [
  ["20261025000000_initial", "6f2384f4d3f09203733a24e56287f62cd06a06a9a617105449a246b4379b80d0"],
  ["20261028000000_brand_hierarchy", "aad0c4ab4374e8d77a7b9075bca8d5aaa2de7e298eecbef9180b8acb6571995b"]
] as const;

export async function verifyDatabaseReadiness(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<{ migration_name: string; checksum: string; finished_at: unknown; rolled_back_at: unknown }[]>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations WHERE rolled_back_at IS NULL LIMIT 101`;
  if (rows.length !== migrationManifest.length || rows.some(r => !r.finished_at) || migrationManifest.some(([name, checksum]) => rows.filter(r => r.migration_name === name && r.checksum === checksum).length !== 1)) throw new Error("Schema unavailable");
  const required: Record<string, string[]> = {
    Brand: ["parentBrandId"], Session: ["id"], User: ["timezone", "emailVerifiedAt", "jobsPhone", "jobsPinHash", "jobsPhoneVerifiedAt"],
    EmailAuthChallenge: ["otpHash", "credentialHash", "attempts", "consumedAt"], NiceJobsContentFile: ["digest", "bytes", "organizationId"],
    LabsCustomerGrant: ["customerUserId", "leadId", "status"], NexaIdentity: ["id", "status"], NexaDirective: ["directorUserId", "organizationId", "status"],
    NiceJobsKnowledgeVersion: ["captions", "transcript", "number", "status", "current"], NiceJobsKnowledgeReceipt: ["acknowledgedAt"],
    NiceJobsAssignment: ["versionId", "lifecycle", "onboardingId", "readinessReviewId"],
    NiceJobsApplication: ["applicationId", "versionId", "revision", "reviewRequestId"], NiceJobsInterview: ["reference"], NiceJobsOffer: ["snapshot"],
    NiceJobsOnboarding: ["planId", "readinessStatus"], NiceJobsTrainingPlan: ["fingerprint"],
    NiceJobsDailyReport: ["assignmentId", "reportDate", "operationalSnapshot"], NiceJobsLead: ["policyId", "currentWorkerAssignmentId"],
    NiceJobsLeadFollowup: ["scheduledAt", "assignmentHistoryId"], NiceJobsPerformanceSnapshot: ["frameworkVersionId", "results"], NiceJobsPip: ["released", "revision"],
    NiceJobsWalletLedger: ["amountMinor", "reference"], NiceJobsPayoutIntent: ["amountMinor", "status"], NiceJobsWalletReversalProposal: ["adjustmentId", "ledgerId"],
    Task: ["niceJobsAssignmentId", "evidenceRequired"], ScheduledJob: ["scanCursor", "scanStartedAt", "scanRuleVersion"],
    AutomationRule: ["lifecycle", "divisionId"], AutomationRun: ["workflowVersionId", "sourceEventId", "attempts", "nextRetryAt", "failureClass"],
    NiceJobsAutomationVersion: ["ruleId", "status", "definition", "publishedAt"], NiceJobsOperationalException: ["companyId", "divisionId", "sourceKey", "status", "revision"]
  };
  const columns = await db.$queryRaw<{ table_name: string; column_name: string }[]>`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`;
  const present = new Set(columns.map(row => `${row.table_name}.${row.column_name}`));
  if (Object.entries(required).some(([table, fields]) => fields.some(field => !present.has(`${table}.${field}`)))) throw new Error("Schema unavailable");
  const expectedTriggers: Record<string, string> = {
    nicejobs_wallet_ledger_no_update: "NiceJobsWalletLedger", nicejobs_wallet_ledger_no_delete: "NiceJobsWalletLedger",
    nicejobs_wallet_ledger_valid_insert: "NiceJobsWalletLedger", nicejobs_ledger_approved_source: "NiceJobsWalletLedger",
    nicejobs_policy_version_immutable: "NiceJobsIncentiveVersion", nicejobs_earning_calculation_immutable: "NiceJobsIncentiveEarning",
    nicejobs_adjustment_proposal_immutable: "NiceJobsWalletAdjustment", nicejobs_statement_snapshot_immutable: "NiceJobsSettlementStatement",
    nicejobs_payout_no_false_confirmation: "NiceJobsPayoutIntent", nicejobs_payout_valid_intent: "NiceJobsPayoutIntent",
    nicejobs_wallet_identity_immutable: "NiceJobsWallet", NiceJobsAutomationPublishedMaterialImmutable: "NiceJobsAutomationVersion",
    NiceJobsAutomationPublishedDeleteForbidden: "NiceJobsAutomationVersion"
  };
  const triggers = await db.$queryRaw<{ name: string; table_name: string; enabled: string }[]>`
    SELECT t.tgname AS name, c.relname AS table_name, t.tgenabled AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND NOT t.tgisinternal`;
  if (Object.entries(expectedTriggers).some(([name, table]) => !triggers.some(trigger => trigger.name === name && trigger.table_name === table && ["O", "A"].includes(trigger.enabled)))) throw new Error("Database safeguards unavailable");
}
