import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const dir = mkdtempSync(join(tmpdir(), "nicejobs-phase05-upgrade-")), file = join(dir, "upgrade.db"), snapshot = join(dir, "phase04.db"), restored = join(dir, "restored.db");
const columns = new Map<string, string[]>();
function signatures(path: string) {
  const sql = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(sql.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok"); assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
    if (!columns.size) for (const r of sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_prisma_migrations' ORDER BY name").all()) columns.set(String(r.name), sql.prepare(`PRAGMA table_info("${r.name}")`).all().map(c => String(c.name)));
    return [...columns].map(([table, names]) => { const rows = sql.prepare(`SELECT ${names.map(n => `"${n}"`).join(",")} FROM "${table}"`).all().map(r => JSON.stringify(r)).sort(); return { table, count: rows.length, hash: createHash("sha256").update(rows.join("\n")).digest("hex") }; });
  } finally { sql.close(); }
}
function upgrade(path: string) {
  const url = "file:" + path.replaceAll("\\", "/");
  const run = (...args: string[]) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 120000 });
  run("migrate", "deploy"); run("migrate", "deploy"); run("migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code");
}
try {
  const source = new DatabaseSync(resolve("prisma/pre-nicejobs-phase05-20261008.db"), { readOnly: true });
  try { assert.equal(source.prepare("SELECT name FROM sqlite_master WHERE name='NiceJobsDailyReport'").get(), undefined); source.prepare("VACUUM INTO ?").run(file); } finally { source.close(); }
  const sql = new DatabaseSync(file);
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    const u = sql.prepare("SELECT id,personId FROM User WHERE personId IS NOT NULL LIMIT 1").get()!, a = sql.prepare("SELECT a.versionId,a.divisionId,t.companyId FROM NiceJobsVersionArea a JOIN NiceJobsVersion v ON v.id=a.versionId JOIN NiceJobsTemplate t ON t.id=v.templateId LIMIT 1").get()!, stamp = Date.now(), id = "phase05-preservation";
    sql.prepare("INSERT INTO NiceJobsApplication(id,reference,candidateId,creatorUserId,companyId,versionId,divisionId,answers,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, "00000000-0000-4000-8000-000000000005", u.personId, u.id, a.companyId, a.versionId, a.divisionId, "{}", stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsOffer(id,reference,applicationId,number,snapshot,createdByUserId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)").run(id, "10000000-0000-4000-8000-000000000005", id, 1, '{"preservationOnly":true}', u.id, stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsTrainingPlan(id,versionId,configuration,fingerprint,createdAt) VALUES (?,?,?,?,?)").run(id, a.versionId, '{"orientation":null,"ojt":null,"readiness":null}', "preservation-only", stamp);
    sql.prepare("INSERT INTO NiceJobsOnboarding(id,reference,applicationId,offerId,planId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)").run(id, "20000000-0000-4000-8000-000000000005", id, id, id, stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsTrainingProgress(id,onboardingId,phase,key,assignedAt) VALUES (?,?,?,?,?)").run(id, id, "ORIENTATION", "preservation", stamp);
    sql.prepare("INSERT INTO NiceJobsWorkerProfile(id,personId,companyId,createdAt,updatedAt) VALUES (?,?,?,?,?)").run(id, u.personId, a.companyId, stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsAssignment(id,profileId,versionId,divisionId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)").run(id, id, a.versionId, a.divisionId, stamp, stamp);
    sql.prepare("INSERT INTO Task(id,organizationId,title,description,assigneePersonId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)").run(id, a.divisionId, "Preservation-only task", "Migration fixture, not live work", u.personId, stamp, stamp);
    sql.prepare("INSERT INTO ExecutionBlocker(id,organizationId,taskId,description,createdAt,updatedAt) VALUES (?,?,?,?,?,?)").run(id, a.divisionId, id, "Preservation-only blocker", stamp, stamp);
    sql.prepare("VACUUM INTO ?").run(snapshot);
  } finally { sql.close(); }
  const before = signatures(file); assert.equal(before.find(r => r.table === "NiceJobsOnboarding")!.count >= 1, true);
  upgrade(file); assert.deepEqual(signatures(file), before);
  const post = new DatabaseSync(file, { readOnly: true }); try { assert.equal(post.prepare("SELECT COUNT(*) AS n FROM NiceJobsDailyReport").get()?.n, 0); assert.equal(post.prepare("SELECT COUNT(*) AS n FROM TaskEvidence").get()?.n, 0); assert.equal(post.prepare("SELECT onboardingId FROM NiceJobsAssignment WHERE id='phase05-preservation'").get()?.onboardingId, null); } finally { post.close(); }
  const backup = new DatabaseSync(snapshot, { readOnly: true }); try { backup.prepare("VACUUM INTO ?").run(restored); } finally { backup.close(); }
  assert.deepEqual(signatures(restored), before); upgrade(restored); assert.deepEqual(signatures(restored), before);
  console.log("PASS populated Phase04 onboarding/workforce/task/blocker preservation; repeated upgrade, zero drift, integrity, restore and re-upgrade"); console.log("Preserved original columns in " + before.length + " tables");
} finally { if (resolve(dir).startsWith(resolve(tmpdir(), "nicejobs-phase05-upgrade-"))) rmSync(dir, { recursive: true, force: true }); else { console.error("Unsafe cleanup refused"); process.exitCode = 1; } }
