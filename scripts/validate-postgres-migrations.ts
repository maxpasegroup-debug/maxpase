import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { migrationManifest, verifyDatabaseReadiness } from "../src/server/security/readiness";
import { migrationValidationDiagnostic, type MigrationValidationStage } from "../src/server/security/diagnostics";

const url = process.env.TEST_DATABASE_URL;
function verifiedTarget(): URL | null {
  let target: URL;
  try { target = new URL(url ?? ""); }
  catch { return null; }
  return process.env.NODE_ENV !== "production" && process.env.MAXPASE_CI_DATABASE_CONFIRMED === "true" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) &&
    target.pathname === "/maxpase_ci" && target.searchParams.get("schema") === "public" &&
    !target.hash && target.searchParams.getAll("schema").length === 1 &&
    [...target.searchParams.keys()].every(key => key === "schema") &&
    ["postgres:", "postgresql:"].includes(target.protocol) && !!target.username && !!target.password ? target : null;
}

async function main(target: URL) {
  const testUrl = target.toString();
  const db = new PrismaClient({ datasourceUrl: testUrl });
  let stage: MigrationValidationStage = "baseline_checksum";
  try {
    const [name, expectedChecksum] = migrationManifest[0];
    const sql = readFileSync(`prisma/migrations/${name}/migration.sql`);
    if (createHash("sha256").update(sql).digest("hex") !== expectedChecksum) throw new Error("Migration checksum differs from the release manifest");
    const env = { ...process.env, DATABASE_URL: testUrl };
    const run = (...args: string[]) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env, stdio: "pipe", timeout: 120000 });
    stage = "target_identity";
    const [identity] = await db.$queryRaw<{ database: string; schema: string; version: number; user: string }[]>`SELECT current_database() AS database, current_schema() AS schema, current_setting('server_version_num')::integer AS version, current_user AS "user"`;
    if (identity.database !== "maxpase_ci" || identity.schema !== "public" || identity.user !== decodeURIComponent(target.username) || identity.version < 160000 || identity.version >= 170000) throw new Error("Test database identity mismatch");
    stage = "empty_database_check";
    const [objects] = await db.$queryRaw<{ count: bigint }[]>`
      SELECT (
        (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f'))
        + (SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e')
        + (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
      ) AS count`;
    if (objects.count !== 0n) throw new Error("Test database is not empty; refusing to change it");
    stage = "initial_migration";
    run("migrate", "deploy");
    stage = "repeat_deploy";
    run("migrate", "deploy");
    stage = "migration_status";
    run("migrate", "status");
    stage = "readiness_and_triggers";
    await verifyDatabaseReadiness(db);
    process.stdout.write("PASS: isolated PostgreSQL baseline, repeat deploy, migration status and readiness\n");
  } catch (error) {
    process.stderr.write(JSON.stringify(migrationValidationDiagnostic(error, stage)) + "\n");
    process.exitCode = 1;
  } finally {
    try { await db.$disconnect(); }
    catch (error) {
      process.stderr.write(JSON.stringify(migrationValidationDiagnostic(error, "disconnect")) + "\n");
      process.exitCode = 1;
    }
  }
}

const target = verifiedTarget();
if (target) void main(target);
else {
  process.stderr.write(JSON.stringify(migrationValidationDiagnostic(undefined, "target_configuration")) + "\n");
  process.exitCode = 1;
}
