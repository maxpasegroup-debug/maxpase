import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { createNiceJobsService } from "../src/server/nicejobs/service";

async function main() {
  loadEnvConfig(process.cwd(), true);
  let target: URL;
  try { target = new URL(process.env.DEV_DATABASE_URL ?? ""); }
  catch { throw new Error("A confirmed local PostgreSQL development target is required."); }
  if (process.env.NODE_ENV === "production" || process.env.MAXPASE_DEV_DATABASE_CONFIRMED !== "true" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    target.pathname !== "/maxpase_dev" || target.searchParams.get("schema") !== "public" ||
    !target.username || !target.password) throw new Error("Refusing an unconfirmed PostgreSQL development target.");
  const db = new PrismaClient({ datasourceUrl: target.toString() });
  try {
    const [identity] = await db.$queryRaw<{ database: string; schema: string; user_name: string }[]>`
      SELECT current_database() AS database, current_schema() AS schema, current_user AS user_name`;
    if (identity.database !== "maxpase_dev" || identity.schema !== "public" || identity.user_name !== decodeURIComponent(target.username)) throw new Error("Development database identity mismatch.");
    const boss = await db.user.findUnique({ where: { email: "boss@maxpase.com" }, select: { id: true, status: true } });
    if (!boss || boss.status !== "ACTIVE") throw new Error("An existing active authorized local Boss account is required.");
    const records = await createNiceJobsService(db).seedInitialOpportunities(boss.id);
    for (const record of records) console.log(`${record.title}: ${record.status} (version ${record.number})`);
    console.log("Local development drafts only. No vacancies were published.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error && !((error as { code?: string }).code) ? error.message : "Local draft configuration failed; no cleanup or database reset was attempted."); process.exitCode = 1; });
