import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const directory = mkdtempSync(join(tmpdir(), "maxpase-migrations-"));
const file = join(directory, "fresh.db"), backup = join(directory, "backup.db"), restored = join(directory, "restored.db");
const url = "file:" + file.replaceAll("\\", "/");
const run = (...args: string[]) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 120000 });
function integrity(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok"); assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []); }
  finally { db.close(); }
}
let stage = "initialize";
try {
  new DatabaseSync(file).close();
  stage = "migrate";
  run("migrate", "deploy"); run("migrate", "deploy"); run("migrate", "status");
  stage = "drift";
  run("migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code");
  stage = "integrity"; integrity(file);
  const db = new DatabaseSync(file);
  try {
    const expected = readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).length;
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL").get()?.count, expected);
    stage = "backup";
    db.exec("CREATE TABLE RestoreProbe (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO RestoreProbe VALUES (?, ?)").run("local-check", "non-business-fixture");
    assert.equal(existsSync(backup), false); db.prepare("VACUUM INTO ?").run(backup);
  } finally { db.close(); }
  stage = "restore";
  const snapshot = new DatabaseSync(backup, { readOnly: true });
  try { snapshot.prepare("VACUUM INTO ?").run(restored); } finally { snapshot.close(); }
  integrity(backup); integrity(restored);
  const restore = new DatabaseSync(restored, { readOnly: true });
  try { assert.equal(restore.prepare("SELECT value FROM RestoreProbe WHERE id = ?").get("local-check")?.value, "non-business-fixture"); } finally { restore.close(); }
  console.log("PASS fresh migration chain, repeat deploy, drift, integrity and isolated local snapshot/restore");
} catch { console.error(`Migration/restore validation failed at ${stage}; no production database was accessed.`); process.exitCode = 1; }
finally { rmSync(directory, { recursive: true, force: true }); }
