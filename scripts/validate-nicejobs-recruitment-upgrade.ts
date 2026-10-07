import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const directory = mkdtempSync(join(tmpdir(), "nicejobs-phase03-upgrade-"));
const file = join(directory, "upgrade.db"), backup = join(directory, "populated-phase02.db"), restored = join(directory, "restore.db");
const tables = ["User", "Person", "Membership", "Role", "Permission", "Organization", "Product", "NiceJobsTemplate", "NiceJobsVersion", "NiceJobsVersionArea", "NiceJobsWorkerProfile", "NiceJobsAssignment", "NiceJobsApplication", "NiceJobsApplicationHistory", "AuditEvent", "OperationalEvent"];
function signatures(path: string) {
  const sql = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(sql.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok"); assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
    return tables.map(table => {
      const columns = table === "NiceJobsApplication" ? "id, reference, applicationId, candidateId, creatorUserId, companyId, versionId, divisionId, status, eligibilityStatus, screeningStatus, answers, candidateMessage, activeKey, revision, submittedAt, createdAt, updatedAt" : "*";
      const rows = sql.prepare(`SELECT ${columns} FROM "${table}"`).all().map(row => JSON.stringify(row)).sort();
      return { table, count: rows.length, signature: createHash("sha256").update(rows.join("\n")).digest("hex") };
    });
  } finally { sql.close(); }
}
function upgrade(path: string) {
  const url = "file:" + path.replaceAll("\\", "/");
  const run = (...args: string[]) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 120000 });
  run("migrate", "deploy"); run("migrate", "deploy"); run("migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code");
}
try {
  const source = new DatabaseSync(resolve("prisma/pre-nicejobs-phase03-20261008.db"), { readOnly: true });
  try { assert.equal(source.prepare("SELECT name FROM sqlite_master WHERE name='NiceJobsInterview'").get(), undefined); source.prepare("VACUUM INTO ?").run(file); } finally { source.close(); }
  const sql = new DatabaseSync(file);
  try {
    const u = sql.prepare("SELECT id, personId FROM User WHERE personId IS NOT NULL LIMIT 1").get()!;
    const a = sql.prepare("SELECT a.versionId, a.divisionId, t.companyId FROM NiceJobsVersionArea a JOIN NiceJobsVersion v ON v.id=a.versionId JOIN NiceJobsTemplate t ON t.id=v.templateId LIMIT 1").get()!;
    const insert = sql.prepare("INSERT INTO NiceJobsApplication(id,reference,applicationId,candidateId,creatorUserId,companyId,versionId,divisionId,status,eligibilityStatus,screeningStatus,answers,activeKey,revision,submittedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    for (let i = 1; i <= 3; i++) insert.run("phase03-upgrade-" + i, "00000000-0000-4000-8000-00000000000" + i, "NJ-UPGRADE-" + i, u.personId, u.id, a.companyId, a.versionId, a.divisionId, ["DRAFT", "SCREENING", "SHORTLISTED"][i - 1], "ELIGIBLE", "PASSED", '{"preserved":"fixture"}', "phase03-upgrade-" + i, i, Date.now(), Date.now(), Date.now());
    for (let i = 1; i <= 3; i++) {
      const id = "phase03-upgrade-" + i, timestamp = Date.now(), state = ["DRAFT", "SCREENING", "SHORTLISTED"][i - 1];
      sql.prepare("INSERT INTO AuditEvent(id,actorUserId,actorPersonId,organizationId,action,entityType,entityId,result,createdAt) VALUES (?,?,?,?,?,?,?,?,?)").run(id, u.id, u.personId, a.divisionId, "nicejobs.application.fixture", "NiceJobsApplication", id, "SUCCESS", timestamp);
      sql.prepare("INSERT INTO OperationalEvent(id,eventType,actorUserId,organizationId,entityType,entityId,status,reference,auditId,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, "nicejobs.application.fixture", u.id, a.divisionId, "NiceJobsApplication", id, "SUCCEEDED", id, id, timestamp);
      sql.prepare("INSERT INTO NiceJobsApplicationHistory(id,applicationId,revision,eventId,action,previousState,nextState,evidence,createdAt) VALUES (?,?,?,?,?,?,?,?,?)").run(id, id, i, id, "PRESERVATION_FIXTURE", "DRAFT", state, '{"isolated":true}', timestamp);
    }
    sql.prepare("VACUUM INTO ?").run(backup);
  } finally { sql.close(); }
  const before = signatures(file); assert.equal(before.find(r => r.table === "NiceJobsApplication")!.count >= 3, true);
  upgrade(file); assert.deepEqual(signatures(file), before);
  const upgraded = new DatabaseSync(file, { readOnly: true });
  try { assert.equal(upgraded.prepare("SELECT COUNT(*) AS n FROM NiceJobsApplication WHERE reviewRequestId IS NULL AND reviewNeedsMore=0").get()?.n, before.find(r => r.table === "NiceJobsApplication")!.count); } finally { upgraded.close(); }
  const snapshot = new DatabaseSync(backup, { readOnly: true }); try { snapshot.prepare("VACUUM INTO ?").run(restored); } finally { snapshot.close(); }
  assert.deepEqual(signatures(restored), before); upgrade(restored); assert.deepEqual(signatures(restored), before);
  console.log("PASS populated Phase02 application/history/audit/event/job/identity preservation, repeat upgrade, zero drift, FK integrity and pre-Phase03 snapshot restore/re-upgrade");
  console.log("Preserved tables: " + before.map(r => r.table + "=" + r.count).join(", "));
} finally {
  if (resolve(directory).startsWith(resolve(tmpdir(), "nicejobs-phase03-upgrade-"))) rmSync(directory, { recursive: true, force: true });
  else { console.error("Unsafe fixture cleanup refused"); process.exitCode = 1; }
}
