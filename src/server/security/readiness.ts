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
  ["20261008100000_nicejobs_onboarding", "2bcbdaaaf778c3445d32d3da3488ca44af0ad9ff882dc7181b7596ccd6315294"]
] as const;

export async function verifyDatabaseReadiness(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<{ migration_name: string; checksum: string; finished_at: unknown; rolled_back_at: unknown }[]>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations WHERE rolled_back_at IS NULL LIMIT 101`;
  if (rows.length !== migrationManifest.length || rows.some(r => !r.finished_at) || migrationManifest.some(([name, checksum]) => rows.filter(r => r.migration_name === name && r.checksum === checksum).length !== 1)) throw new Error("Schema unavailable");
  await db.$queryRaw`SELECT id FROM Session LIMIT 1`;
  await db.$queryRaw`SELECT timezone FROM User LIMIT 1`;
  await db.$queryRaw`SELECT versionId, lifecycle FROM NiceJobsAssignment LIMIT 1`;
  await db.$queryRaw`SELECT applicationId, versionId, revision FROM NiceJobsApplication LIMIT 1`;
  await db.$queryRaw`SELECT reviewRequestId FROM NiceJobsApplication LIMIT 1`;
  await db.$queryRaw`SELECT reference FROM NiceJobsInterview LIMIT 1`;
  await db.$queryRaw`SELECT snapshot FROM NiceJobsOffer LIMIT 1`;
  await db.$queryRaw`SELECT planId, readinessStatus FROM NiceJobsOnboarding LIMIT 1`;
  await db.$queryRaw`SELECT fingerprint FROM NiceJobsTrainingPlan LIMIT 1`;
  await db.$queryRaw`SELECT scanCursor, scanStartedAt, scanRuleVersion FROM ScheduledJob LIMIT 1`;
}
