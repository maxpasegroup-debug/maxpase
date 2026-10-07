import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const source = resolve("prisma/pre-nicejobs-phase02-20261007.db"), local = resolve("prisma/dev.db");
const directory = mkdtempSync(join(tmpdir(), "nicejobs-upgrade-")), restored = join(directory, "restored.db");
const tables = ["User", "Person", "Membership", "Role", "Permission", "Organization", "Product", "NiceJobsTemplate", "NiceJobsVersion", "NiceJobsVersionArea", "NiceJobsWorkerProfile", "NiceJobsAssignment"];
function signatures(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok"); assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    return tables.map(table => {
      const rows = db.prepare(`SELECT * FROM "${table}"`).all().map(row => JSON.stringify(row)).sort();
      return { table, count: rows.length, signature: createHash("sha256").update(rows.join("\n")).digest("hex") };
    });
  } finally { db.close(); }
}
try {
  const before = signatures(source); assert.deepEqual(signatures(local), before);
  const snapshot = new DatabaseSync(source, { readOnly: true });
  try { assert.equal(snapshot.prepare("SELECT name FROM sqlite_master WHERE name='NiceJobsApplication'").get(), undefined); snapshot.prepare("VACUUM INTO ?").run(restored); } finally { snapshot.close(); }
  const url = "file:" + restored.replaceAll("\\", "/");
  const run = (...args: string[]) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 120000 });
  run("migrate", "deploy"); run("migrate", "deploy"); run("migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code");
  assert.deepEqual(signatures(restored), before);
  console.log("PASS populated local upgrade, identity/job preservation, pre-Phase02 snapshot restoration, repeat upgrade, drift and foreign-key integrity");
  console.log("Preserved fixture/local row counts: " + before.map(row => `${row.table}=${row.count}`).join(", "));
} finally { rmSync(directory, { recursive: true, force: true }); }
