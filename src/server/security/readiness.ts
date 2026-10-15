import type { Prisma } from "@prisma/client";

// Release manifest: update alongside an intentional migration, never by inspecting the live database.
export const migrationManifest = [
  ["20261002120000_phase_01_foundation", "5d3caad1f6e87cafb6f754e6faf3682b2ebf7361809dbb68b1a8a1c4b9d888f7"],
  ["20261002130000_phase_02_business_graph", "5cf1733b8a9379d8aec5a2dc53f266a130dca8092c5ac9830b82fb6f735b5631"],
  ["20261002140000_phase_02_unknown_legal_names", "78489c099996ba29f828f00917bef5884365edf9885b660d6500cac8488b1fd7"],
  ["20261002150000_phase_03_people_access", "ef12f669f30f972e1e5a92d8b96bb43d42ba8559cd31f18b2f0c59475c11e7df"],
  ["20261002160000_phase_04_execution", "945bd7d9c90d1233db4c7478c3f64589aab55f5ad7a04562afc51514b6975dc3"],
  ["20261002170000_phase_05_operations", "730670c15b623ce567cc27db5b45ca3b1d1c75edd0f04def77b44b85cce35703"],
  ["20261004120000_phase_06_company_os", "c59d399745e9a133b58a3ab958ab2064b0953b8b4181f839354df0626330e9d2"],
  ["20261004130000_phase_07_executive", "2b543e9bb1f4ffe01c1e83a494cb025163b96c845e8dca7c2008c22f23299e0b"],
  ["20261004140000_phase_08_sia", "e6527e8ed031c670dde403a9fb439a817505208487f5a751d9298b548a4083ef"],
  ["20261004150000_phase_09_communications", "b3ff9284250bacb8fd254a356915cefe6060134d357a7c036ca1cc8e85d4a052"],
  ["20261004180000_phase_10_hardening", "9282441fb059ed41f6d05206e73ade37a6acdb7f19ee17af82118c8773b0bbfa"],
  ["20261004230000_wave_02_scan_progress", "b1fbcbd59e9cbc0e896a0e1c3904212e1e084c2dd7463cc25f25e6c765516106"],
  ["20261006090000_account_timezone", "558ec7b249c7cad2d58b153b2aff54c772ec9464b694c39ebe4596be11c913fc"],
  ["20261007100000_nicejobs_workforce", "3300503e959f73cc08b5f439b5d0defcb0e70438a44ae6eff57356e01ed9c8bb"],
  ["20261007120000_nicejobs_applications", "b77d3456665a6e36f0e4e015312f6d05a125dc5cf98a7418fbaad12758f55cd6"],
  ["20261007140000_nicejobs_recruitment", "ccf90d10c48676baec2d3d67d14c1fb3901b70afc0153b9cff40808b641feaa2"],
  ["20261008100000_nicejobs_onboarding", "2bcbdaaaf778c3445d32d3da3488ca44af0ad9ff882dc7181b7596ccd6315294"],
  ["20261008120000_nicejobs_employee_workspace", "2ce356509476e6a4cfdeb1ee03b789ece60eea0404d774632af5bfdb3d62b954"],
  ["20261008140000_nicejobs_daily_work_leads", "08b16c00b98307624542b8bc00b56188997671ff2a7daa39761c68e3029a0742"],
  ["20261008160000_nicejobs_knowledge_communication", "2ea9d017dda611d7818d15154b5d541b00727949e9985056acc2d8218564d819"],
  ["20261008180000_nicejobs_performance_pip", "200db4aca0219d6d0a3a5a3adf55c746ecf6ac461bb2fc7fc184b7f5f8858ff6"],
  ["20261009003000_nicejobs_incentive_wallet_settlement", "b6df021b13d0d09bfce8adecd7dbe3c07b3206bdda48126b1a8d94a683465f6f"],
  ["20261009004000_nicejobs_wallet_reversal_boundary", "bebc48a1d2640b4d309383077a778e7c8416e8c39d3240a7d1d63176021848c3"],
  ["20261009005000_nicejobs_financial_immutability", "3ec7fea1b3bd98b313ecdc60664266e8e2676fea17726a0d1a8888723a5d8e5e"],
  ["20261009122905_nicejobs_automation_command", "b8bb62031b7b6410c3679fc3effa23893af57f22e658e3a78976508d2e3ae978"],
  ["20261010100000_nicejobs_email_otp", "dd5abdb61b1b82292abb661928dee4ad2ae4a11ee41b3423269a35df0475edd0"],
  ["20261013090000_nicejobs_secure_content", "f2048c4912e0068a1b082e118c8b762f726d0279dda9e51013ae0e439897e682"],
  ["20261014090000_labs_customer_grants", "b028f2ee9ded01d0be125eec340ff322403e594b66ec3029e44179b1de4f69aa"],
  ["20261015090000_nexa_directives", "9bf20876b4528ebea77e7887b1b2d22bef5183eaf0097f04d95732c6aed4bd99"]
] as const;

export async function verifyDatabaseReadiness(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<{ migration_name: string; checksum: string; finished_at: unknown; rolled_back_at: unknown }[]>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations WHERE rolled_back_at IS NULL LIMIT 101`;
  if (rows.length !== migrationManifest.length || rows.some(r => !r.finished_at) || migrationManifest.some(([name, checksum]) => rows.filter(r => r.migration_name === name && r.checksum === checksum).length !== 1)) throw new Error("Schema unavailable");
  await db.$queryRaw`SELECT id FROM Session LIMIT 1`;
  await db.$queryRaw`SELECT timezone FROM User LIMIT 1`;
  await db.$queryRaw`SELECT emailVerifiedAt FROM User LIMIT 1`;
  await db.$queryRaw`SELECT otpHash, credentialHash, attempts, consumedAt FROM EmailAuthChallenge LIMIT 1`;
  await db.$queryRaw`SELECT digest, bytes, organizationId FROM NiceJobsContentFile LIMIT 1`;
  await db.$queryRaw`SELECT customerUserId, leadId, status FROM LabsCustomerGrant LIMIT 1`;
  await db.$queryRaw`SELECT id, status FROM NexaIdentity LIMIT 1`;
  await db.$queryRaw`SELECT directorUserId, organizationId, status FROM NexaDirective LIMIT 1`;
  await db.$queryRaw`SELECT captions, transcript FROM NiceJobsKnowledgeVersion LIMIT 1`;
  await db.$queryRaw`SELECT versionId, lifecycle FROM NiceJobsAssignment LIMIT 1`;
  await db.$queryRaw`SELECT applicationId, versionId, revision FROM NiceJobsApplication LIMIT 1`;
  await db.$queryRaw`SELECT reviewRequestId FROM NiceJobsApplication LIMIT 1`;
  await db.$queryRaw`SELECT reference FROM NiceJobsInterview LIMIT 1`;
  await db.$queryRaw`SELECT snapshot FROM NiceJobsOffer LIMIT 1`;
  await db.$queryRaw`SELECT planId, readinessStatus FROM NiceJobsOnboarding LIMIT 1`;
  await db.$queryRaw`SELECT fingerprint FROM NiceJobsTrainingPlan LIMIT 1`;
  await db.$queryRaw`SELECT onboardingId, readinessReviewId FROM NiceJobsAssignment LIMIT 1`;
  await db.$queryRaw`SELECT assignmentId, reportDate FROM NiceJobsDailyReport LIMIT 1`;
  await db.$queryRaw`SELECT operationalSnapshot FROM NiceJobsDailyReport LIMIT 1`;
  await db.$queryRaw`SELECT policyId, currentWorkerAssignmentId FROM NiceJobsLead LIMIT 1`;
  await db.$queryRaw`SELECT scheduledAt, assignmentHistoryId FROM NiceJobsLeadFollowup LIMIT 1`;
  await db.$queryRaw`SELECT number, status, current FROM NiceJobsKnowledgeVersion LIMIT 1`;
  await db.$queryRaw`SELECT acknowledgedAt FROM NiceJobsKnowledgeReceipt LIMIT 1`;
  await db.$queryRaw`SELECT frameworkVersionId, results FROM NiceJobsPerformanceSnapshot LIMIT 1`;
  await db.$queryRaw`SELECT released, revision FROM NiceJobsPip LIMIT 1`;
  await db.$queryRaw`SELECT amountMinor, reference FROM NiceJobsWalletLedger LIMIT 1`;
  await db.$queryRaw`SELECT amountMinor, status FROM NiceJobsPayoutIntent LIMIT 1`;
  await db.$queryRaw`SELECT adjustmentId, ledgerId FROM NiceJobsWalletReversalProposal LIMIT 1`;
  const financialTriggers = await db.$queryRaw<{ name: string }[]>`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('nicejobs_wallet_ledger_no_update', 'nicejobs_wallet_ledger_no_delete', 'nicejobs_wallet_ledger_valid_insert', 'nicejobs_policy_version_immutable', 'nicejobs_earning_calculation_immutable', 'nicejobs_adjustment_proposal_immutable', 'nicejobs_statement_snapshot_immutable', 'nicejobs_payout_no_false_confirmation', 'nicejobs_payout_valid_intent', 'nicejobs_wallet_identity_immutable', 'nicejobs_ledger_approved_source')`;
  if (financialTriggers.length !== 11) throw new Error("Financial safeguards unavailable");
  await db.$queryRaw`SELECT niceJobsAssignmentId, evidenceRequired FROM Task LIMIT 1`;
  await db.$queryRaw`SELECT scanCursor, scanStartedAt, scanRuleVersion FROM ScheduledJob LIMIT 1`;
  await db.$queryRaw`SELECT lifecycle, divisionId FROM AutomationRule LIMIT 1`;
  await db.$queryRaw`SELECT workflowVersionId, sourceEventId, attempts, nextRetryAt, failureClass FROM AutomationRun LIMIT 1`;
  await db.$queryRaw`SELECT ruleId, status, definition, publishedAt FROM NiceJobsAutomationVersion LIMIT 1`;
  await db.$queryRaw`SELECT companyId, divisionId, sourceKey, status, revision FROM NiceJobsOperationalException LIMIT 1`;
  const automationTriggers = await db.$queryRaw<{ name: string }[]>`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('NiceJobsAutomationPublishedMaterialImmutable', 'NiceJobsAutomationPublishedDeleteForbidden')`;
  if (automationTriggers.length !== 2) throw new Error("Automation safeguards unavailable");
}
