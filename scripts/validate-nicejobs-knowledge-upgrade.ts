import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const dir = mkdtempSync(join(tmpdir(), "nicejobs-phase07-upgrade-")), file = join(dir, "upgrade.db"), snapshot = join(dir, "phase06.db"), restored = join(dir, "restored.db");
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
  const source = new DatabaseSync(resolve("prisma/pre-nicejobs-phase07-20261008.db"), { readOnly: true });
  try { assert.equal(source.prepare("SELECT name FROM sqlite_master WHERE name='NiceJobsKnowledge'").get(), undefined); source.prepare("VACUUM INTO ?").run(file); } finally { source.close(); }
  const sql = new DatabaseSync(file);
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    const u = sql.prepare("SELECT id,personId FROM User WHERE personId IS NOT NULL LIMIT 1").get()!, a = sql.prepare("SELECT a.versionId,a.divisionId,t.companyId FROM NiceJobsVersionArea a JOIN NiceJobsVersion v ON v.id=a.versionId JOIN NiceJobsTemplate t ON t.id=v.templateId LIMIT 1").get()!, stamp = Date.now(), id = "phase07-preservation";
    sql.prepare("INSERT INTO NiceJobsApplication(id,reference,candidateId,creatorUserId,companyId,versionId,divisionId,answers,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, "00000000-0000-4000-8000-000000000005", u.personId, u.id, a.companyId, a.versionId, a.divisionId, "{}", stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsOffer(id,reference,applicationId,number,snapshot,createdByUserId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)").run(id, "10000000-0000-4000-8000-000000000005", id, 1, '{"preservationOnly":true}', u.id, stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsTrainingPlan(id,versionId,configuration,fingerprint,createdAt) VALUES (?,?,?,?,?)").run(id, a.versionId, '{"orientation":null,"ojt":null,"readiness":null}', "preservation-only", stamp);
    sql.prepare("INSERT INTO NiceJobsOnboarding(id,reference,applicationId,offerId,planId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)").run(id, "20000000-0000-4000-8000-000000000005", id, id, id, stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsTrainingProgress(id,onboardingId,phase,key,assignedAt) VALUES (?,?,?,?,?)").run(id, id, "ORIENTATION", "preservation", stamp);
    sql.prepare("INSERT INTO NiceJobsWorkerProfile(id,personId,companyId,createdAt,updatedAt) VALUES (?,?,?,?,?)").run(id, u.personId, a.companyId, stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsAssignment(id,profileId,versionId,divisionId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)").run(id, id, a.versionId, a.divisionId, stamp, stamp);
    sql.prepare("INSERT INTO Task(id,organizationId,title,description,assigneePersonId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)").run(id, a.divisionId, "Preservation-only task", "Migration fixture, not live work", u.personId, stamp, stamp);
    sql.prepare("INSERT INTO ExecutionBlocker(id,organizationId,taskId,description,createdAt,updatedAt) VALUES (?,?,?,?,?,?)").run(id, a.divisionId, id, "Preservation-only blocker", stamp, stamp);
    sql.prepare("INSERT INTO NiceJobsDailyReport(id,assignmentId,reportDate,timezone,taskSnapshot,blockerSnapshot,submittedByUserId,submittedByPersonId,submittedAt) VALUES (?,?,?,?,?,?,?,?,?)").run(id,id,"2026-10-08","UTC","[]","[]",u.id,u.personId,stamp);
    sql.prepare("INSERT INTO TaskEvidence(id,taskId,actorUserId,actorPersonId,data,createdAt) VALUES (?,?,?,?,?,?)").run(id,id,u.id,u.personId,'{"text":"Preservation-only evidence"}',stamp);

    const insert = (table: string, values: Record<string, SQLInputValue>) => { const keys = Object.keys(values); sql.prepare("INSERT INTO " + table + "(" + keys.join(",") + ") VALUES (" + keys.map(() => "?").join(",") + ")").run(...keys.map(k => values[k])); };
    insert("WorkflowDefinition",{id,organizationId:a.divisionId,scopeKey:"organization",key:"PRESERVATION_PHASE06",version:1,name:"Preservation-only lead process",status:"ACTIVE",createdAt:stamp,updatedAt:stamp});
    insert("WorkflowState",{id,definitionId:id,key:"NEW",name:"Preservation-only state",initial:1});
    insert("NiceJobsLeadPolicy",{id,companyId:a.companyId,divisionId:a.divisionId,name:"Preservation-only policy",definitionId:id,allowedSources:'["MANUAL"]',followupRequiredStates:"[]",createdByUserId:u.id});
    insert("NiceJobsLeadEligibility",{policyId:id,versionId:a.versionId});
    insert("WorkflowInstance",{id,definitionId:id,organizationId:a.divisionId,resourceType:"NICE_JOBS_LEAD",resourceId:id,title:"Preservation-only lead",creatorUserId:u.id,currentStateId:id,idempotencyKey:id,fingerprint:"preservation",updatedAt:stamp});
    insert("NiceJobsLead",{id,companyId:a.companyId,divisionId:a.divisionId,policyId:id,workflowInstanceId:id,name:"Preservation-only contact",phone:"+919000000001",source:"MANUAL",currentWorkerAssignmentId:id,updatedAt:stamp});
    insert("NiceJobsLeadAssignment",{id,leadId:id,workerAssignmentId:id,assignedByUserId:u.id,reason:"Migration fixture only"});
    insert("NiceJobsLeadFollowup",{id,leadId:id,assignmentHistoryId:id,workerAssignmentId:id,scheduledAt:stamp+3600000,type:"CALL",purpose:"Preservation-only follow-up",notes:"Original historical notes",updatedAt:stamp});
    insert("AuditEvent",{id,organizationId:a.divisionId,actorUserId:u.id,actorPersonId:u.personId,action:"nicejobs.lead.create",entityType:"NiceJobsLead",entityId:id,result:"SUCCESS"});
    insert("OperationalEvent",{id,actorUserId:u.id,organizationId:a.divisionId,eventType:"nicejobs.lead.create",entityType:"NiceJobsLead",entityId:id,status:"SUCCEEDED",reference:id,auditId:id});
    insert("NiceJobsLeadActivity",{id,leadId:id,eventId:id,workerAssignmentId:id,kind:"CREATE",visibility:"WORKER"});
    sql.prepare("UPDATE NiceJobsDailyReport SET operationalSnapshot=? WHERE id=?").run('{"status":"AVAILABLE","leadsWorked":1,"contactsRecorded":0,"followupsCompleted":0,"followupsPending":1}',id);
    sql.prepare("UPDATE ExecutionBlocker SET niceJobsLeadId=? WHERE id=?").run(id,id);

    sql.prepare("VACUUM INTO ?").run(snapshot);
  } finally { sql.close(); }
  const before = signatures(file); assert.equal(before.find(r => r.table === "NiceJobsOnboarding")!.count >= 1, true);
  upgrade(file); assert.deepEqual(signatures(file), before);
  const post = new DatabaseSync(file, { readOnly: true }); try { for (const table of ["NiceJobsKnowledge", "NiceJobsKnowledgeVersion", "NiceJobsSopStep", "NiceJobsKnowledgeReceipt", "NiceJobsKnowledgeWorkLink"]) assert.equal(post.prepare("SELECT COUNT(*) AS n FROM " + table).get()?.n, 0); } finally { post.close(); }
  const backup = new DatabaseSync(snapshot, { readOnly: true }); try { backup.prepare("VACUUM INTO ?").run(restored); } finally { backup.close(); }
  assert.deepEqual(signatures(restored), before); upgrade(restored); assert.deepEqual(signatures(restored), before);
  console.log("PASS populated Phase06 onboarding/workforce/task/blocker/report/evidence preservation; repeated upgrade, zero drift, integrity, restore and re-upgrade"); console.log("Preserved original columns in " + before.length + " tables");
} finally { if (resolve(dir).startsWith(resolve(tmpdir(), "nicejobs-phase07-upgrade-"))) rmSync(dir, { recursive: true, force: true }); else { console.error("Unsafe cleanup refused"); process.exitCode = 1; } }
