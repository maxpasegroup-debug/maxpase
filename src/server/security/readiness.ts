import type { Prisma } from "@prisma/client";

// Release manifest: update alongside an intentional migration, never by inspecting the live database.
export const migrationManifest = [
  ["20261025000000_initial", "6f2384f4d3f09203733a24e56287f62cd06a06a9a617105449a246b4379b80d0"],
  ["20261028000000_brand_hierarchy", "aad0c4ab4374e8d77a7b9075bca8d5aaa2de7e298eecbef9180b8acb6571995b"],
  ["20261031000000_hr_employment_assignments", "46bb12a2d689236974021827a0c85c777e678f47355bc032ab62e236d1cfbb4a"],
  ["20261101000000_hr_documents", "0d2c7925cc24e8b68dd90b938e97922be879984988a5b015b8ab59ad7ad9a83d"],
  ["20261101010000_hr_document_employee_visibility", "6f5064d359a25c3d3a05db24045cc789b6d34fdd136a805589367b2a37b21f63"],
  ["20261101020000_hr_company_configuration", "9f7b1cf98ab1cdb4f2d46180fa02c86698c8ce6b9f9a05e9728073b47683aa8a"],
  ["20261104000000_nicejobs_tara_transcript", "f9a92220dbc068f3044c586f69411064ead1b50a8f3fbe355e5102df19c76a2c"],
    ["20261105000000_nicejobs_participant_identity", "f72d0f0cbe590e57cf046eba82f760e0abbef1c455a701a4a39b0777936f323c"],
    ["20261106000000_nicejobs_source_events", "c184c280d9e488beb24c753dae17d361ba0fe26829bcd178fd645fe4014a3c7d"],
    ["20261106010000_nicejobs_admission_incentives", "aec3955c3ead6ec54428790324f57021b2fd4c5414cc560e59df949e823cd5c4"],
    ["20261107000000_aira_labs_billing_profile", "0e50be29fdf33ecf4c10763166bb294b48c423325d3b804f00228d76e915e110"],
    ["20261108000000_hr_profiles_retention", "784f77c86b001febc134e52fa1a3e7d09abcc771b2cc8bd959034d96dcbf7cec"],
    ["20261108010000_hr_recruitment_letters", "ce0e677b98c05f04b3fe96541bd7332042734494e3fe90d8bced6bd412b36ede"],
    ["20261108020000_hr_delivery_storage", "e47660037bfcb566043cf3509b298c848cb1d448be9e72d24096571dc3d23e5b"],
    ["20261108030000_hr_payroll", "69c470c0cb833998c9dcb2a478729784b9995ca1236bf1d792e0664541b33e81"],
  ["20261109000000_nicejobs_portal_intro_video", "44c0daa4d83b1237d19f14ff1a370bad0436edca81e9e2a67e2b4af82d616af7"],
  ["20261112090000_aira_journey_metrics", "c8404e8f0f4f1108d822e01b7f8d1976893096bf6d6bef5392747ea661814a9e"],
  ["20261113000000_nicejobs_multilingual_intro", "401a2e69065d2c91951f6e0f21e00f657bb1de808621428920983e844d0b1b13"],
  ["20261114110000_boss_money_tracker", "63240bc5b0baa0c40ac12a9a3795ef846ee7fb61b4dec3b8059b98bb7c8b492a"]
] as const;

export async function verifyDatabaseReadiness(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<{ migration_name: string; checksum: string; finished_at: unknown; rolled_back_at: unknown }[]>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations WHERE rolled_back_at IS NULL LIMIT 101`;
  if (rows.length !== migrationManifest.length || rows.some(r => !r.finished_at) || migrationManifest.some(([name, checksum]) => rows.filter(r => r.migration_name === name && r.checksum === checksum).length !== 1)) throw new Error("Schema unavailable");
  const required: Record<string, string[]> = {
    Brand: ["parentBrandId"], Employment: ["personId", "companyId", "status", "employmentType", "contactEmail", "contactPhone", "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone", "emergencyContactEmail"], HrAssignment: ["employmentId", "brandId", "status"], HrDocument: ["employmentId", "companyId", "brandId", "assetId", "status", "employeeVisible", "retentionDays", "retentionDueAt", "retentionPolicyReference", "retentionReviewedAt", "retentionReviewReference"], HrDocumentCategory: ["companyId", "key", "retentionDays", "retentionDecisionReference", "updatedAt"], HrCandidate: ["companyId", "brandId", "status", "convertedEmploymentId"], HrLetterTemplate: ["companyId", "brandId", "kind", "subject", "body", "active"], HrLetter: ["companyId", "brandId", "candidateId", "employmentId", "kind", "status", "deliveryStatus", "bodySnapshot", "acceptanceTokenHash", "providerReference", "lastDeliveryEventAt", "storedDocumentId", "documentStorageStatus", "documentStorageStartedAt"], HrLetterDeliveryEvent: ["providerEventId", "letterId", "eventType", "occurredAt"], HrCompensation: ["companyId", "employmentId", "effectiveFrom", "currency", "monthlyBasePaise", "monthlyVariablePaise", "decisionReference", "createdByUserId"], HrPayrollRuleSet: ["companyId", "name", "currency", "componentsSnapshot", "status", "accountantName", "accountantReviewReference", "accountantReviewedAt", "recordedByUserId", "updatedAt"], HrPayrollRun: ["companyId", "period", "status", "ruleSetId", "ruleSnapshot", "excludedEmployeesSnapshot", "totalGrossPaise", "totalDeductionsPaise", "totalNetPaise", "reviewedAt", "reviewReference", "reviewedByUserId", "reconciliationReference", "reconciledAt", "reconciledByUserId", "voidReference", "voidedAt", "voidedByUserId"], HrPayrollLine: ["runId", "employmentId", "employeeName", "monthlyBasePaise", "monthlyVariablePaise", "ruleEarningsPaise", "grossPaise", "deductionsPaise", "netPaise", "componentsSnapshot", "payslipDocumentId"], HrPayrollPayment: ["lineId", "amountPaise", "paymentReference", "evidenceReference", "paidAt", "status", "reconciledAt", "recordedByUserId", "updatedAt"], HrCompanyOnboardingConfig: ["companyId", "proposedPortalHost", "proposedSenderEmail"], Session: ["id"], User: ["timezone", "emailVerifiedAt", "jobsPhone", "jobsPinHash", "jobsPhoneVerifiedAt"],
    EmailAuthChallenge: ["otpHash", "credentialHash", "attempts", "consumedAt"], SiaRun: ["conversationPrompt", "conversationResponse", "conversationContext"], NiceJobsContentFile: ["digest", "bytes", "organizationId"], NiceJobsPortalIntroduction: ["companyId", "languageCode", "publishedMediaFileId", "draftAudioFileId", "draftVideoFileId", "publishedAt"], NiceJobsIntroPlaybackSession: ["tokenHash", "mediaFileId", "creditedSeconds", "status", "expiresAt", "consumedAt"],
    LabsCustomerGrant: ["customerUserId", "leadId", "status"], NexaIdentity: ["id", "status"], NexaDirective: ["directorUserId", "organizationId", "status"],
    NiceJobsKnowledgeVersion: ["captions", "transcript", "number", "status", "current"], NiceJobsKnowledgeReceipt: ["acknowledgedAt"],
    NiceJobsAssignment: ["versionId", "lifecycle", "onboardingId", "readinessReviewId"], Person: ["niceJobsId"], NiceJobsReferralLink: ["assignmentId", "versionId", "companyId", "token"], NiceJobsAdmission: ["referralId", "companyId", "externalAdmissionId", "eventReference", "status"],
    NiceJobsApplication: ["applicationId", "versionId", "revision", "reviewRequestId"], NiceJobsInterview: ["reference"], NiceJobsOffer: ["snapshot"],
    NiceJobsOnboarding: ["planId", "readinessStatus"], NiceJobsTrainingPlan: ["fingerprint"],
    NiceJobsDailyReport: ["assignmentId", "reportDate", "operationalSnapshot"], NiceJobsLead: ["policyId", "currentWorkerAssignmentId"],
    NiceJobsLeadFollowup: ["scheduledAt", "assignmentHistoryId"], NiceJobsPerformanceSnapshot: ["frameworkVersionId", "results"], NiceJobsPip: ["released", "revision"],
    NiceJobsWalletLedger: ["amountMinor", "reference"], NiceJobsIncentiveEarning: ["snapshotId", "admissionId", "policyVersionId"], NiceJobsSourceEvent: ["externalEventId", "externalTransactionId", "status"], NiceJobsPayoutIntent: ["amountMinor", "status"], NiceJobsWalletReversalProposal: ["adjustmentId", "ledgerId"],
    Task: ["niceJobsAssignmentId", "evidenceRequired"], ScheduledJob: ["scanCursor", "scanStartedAt", "scanRuleVersion"],
    AutomationRule: ["lifecycle", "divisionId"], AutomationRun: ["workflowVersionId", "sourceEventId", "attempts", "nextRetryAt", "failureClass"],
    LabsBillingProfile: ["companyId", "legalName", "gstin", "profileStatus", "taxReviewStatus", "eInvoiceStatus"], LabsBillingEvidence: ["companyId", "profileId", "storageKey", "fileName"],
    LabsBillingCustomer: ["companyId", "legalName", "gstRegistrationStatus", "placeOfSupply"], LabsBillingService: ["companyId", "sacCode", "gstBasisPoints", "taxApprovalStatus"],
    LabsBillingInvoice: ["companyId", "divisionId", "quoteId", "invoiceNumber", "supplierSnapshot", "customerSnapshot", "calculationSnapshot"], LabsBillingPayment: ["invoiceId", "verificationStatus", "reconciliationEvidence"], LabsVendorBill: ["companyId", "approvalStatus", "paymentStatus", "paymentEvidence"],
    NiceJobsAutomationVersion: ["ruleId", "status", "definition", "publishedAt"], NiceJobsOperationalException: ["companyId", "divisionId", "sourceKey", "status", "revision"],
    BossMoneyRecord: ["ownerUserId", "recordKey", "kind", "payload", "amountPaise", "dailyBudgetPaise", "investmentPaise", "salesPaise", "otherReceiptsPaise", "historicalExpensesPaise", "adjustmentPaise", "revision"]
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
