import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { createNiceJobsService } from "../src/server/nicejobs/service";

async function main() {
  loadEnvConfig(process.cwd(), true);
  const url = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production" || !url?.startsWith("file:") || url.includes("?")) throw new Error("Only an existing local SQLite database is allowed.");
  const path = url.slice(5), target = resolve(isAbsolute(path) ? path : resolve("prisma", path));
  const within = relative(process.cwd(), target);
  if (!within || within.startsWith("..") || isAbsolute(within) || !existsSync(target)) throw new Error("Database must already exist inside this workspace.");
  const db = new PrismaClient({ datasourceUrl: "file:" + target.replaceAll("\\", "/") });
  try {
    const boss = await db.user.findUnique({ where: { email: "boss@maxpase.com" }, select: { id: true, status: true } });
    if (!boss || boss.status !== "ACTIVE") throw new Error("An existing active authorized local Boss account is required.");
    const records = await createNiceJobsService(db).seedInitialOpportunities(boss.id);
    for (const record of records) console.log(`${record.title}: ${record.status} (version ${record.number})`);
    console.log("Local drafts only. No vacancies were published and no production database was contacted.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error && !((error as { code?: string }).code) ? error.message : "Local draft configuration failed; no cleanup or database reset was attempted."); process.exitCode = 1; });
