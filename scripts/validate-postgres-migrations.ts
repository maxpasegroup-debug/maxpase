import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { migrationManifest, verifyDatabaseReadiness } from "../src/server/security/readiness";

const url = process.env.TEST_DATABASE_URL;
let target: URL;
try { target = new URL(url ?? ""); }
catch { throw new Error("An isolated local PostgreSQL test URL is required"); }
if (process.env.NODE_ENV === "production" || process.env.MAXPASE_CI_DATABASE_CONFIRMED !== "true" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/maxpase_ci" || target.searchParams.get("schema") !== "public" ||
  !["postgres:", "postgresql:"].includes(target.protocol) || !target.username || !target.password) {
  throw new Error("Refusing migration validation without a confirmed local maxpase_ci target");
}

const [name, expectedChecksum] = migrationManifest[0];
const sql = readFileSync(`prisma/migrations/${name}/migration.sql`);
if (createHash("sha256").update(sql).digest("hex") !== expectedChecksum) throw new Error("Migration checksum differs from the release manifest");

const env = { ...process.env, DATABASE_URL: url };
const run = (...args: string[]) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env, stdio: "pipe", timeout: 120000 });
async function main() {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const [identity] = await db.$queryRaw<{ database: string; schema: string }[]>`SELECT current_database() AS database, current_schema() AS schema`;
    if (identity.database !== "maxpase_ci" || identity.schema !== "public") throw new Error("Test database identity mismatch");
    const [objects] = await db.$queryRaw<{ count: bigint }[]>`
      SELECT (
        (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f'))
        + (SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e')
        + (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
      ) AS count`;
    if (objects.count !== 0n) throw new Error("Test database is not empty; refusing to change it");
    run("migrate", "deploy");
    run("migrate", "deploy");
    run("migrate", "status");
    await verifyDatabaseReadiness(db);
    process.stdout.write("PASS: isolated PostgreSQL baseline, repeat deploy, migration status and readiness\n");
  } catch {
    process.stderr.write("PostgreSQL migration validation failed; inspect the isolated test target privately. No reset was attempted.\n");
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main();
