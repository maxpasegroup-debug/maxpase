import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const [sourceArg, destinationArg] = process.argv.slice(2);
if (!sourceArg || !destinationArg) throw new Error("Usage: tsx scripts/backup-sqlite.ts <source-file> <new-backup-file>");
const source = resolve(sourceArg), destination = resolve(destinationArg);
if (!existsSync(source) || existsSync(destination) || source === destination) throw new Error("Source must exist; backup destination must be new");
const db = new DatabaseSync(source, { readOnly: true });
try {
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Source integrity check failed");
  db.prepare("VACUUM INTO ?").run(destination);
} finally { db.close(); }
const backup = new DatabaseSync(destination, { readOnly: true });
try {
  if (backup.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" || backup.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Backup integrity check failed");
  console.log("PASS consistent SQLite snapshot and integrity verification; secure retention remains operator responsibility");
} finally { backup.close(); }
