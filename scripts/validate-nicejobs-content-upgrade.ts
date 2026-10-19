import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir=mkdtempSync(join(tmpdir(),"nicejobs-content-upgrade-")),file=join(dir,"upgrade.db"),snapshot=join(dir,"before.db");
let sql: DatabaseSync | undefined;
try {
  const folders=readdirSync("prisma/migrations").filter(f=>/^\d/.test(f)).sort(),target=folders.indexOf("20261013090000_nicejobs_secure_content");
  assert.ok(target>0);
  sql=new DatabaseSync(file);
  for (const folder of folders.slice(0,target)) sql.exec(readFileSync(join("prisma/migrations",folder,"migration.sql"),"utf8"));
  sql.exec("INSERT INTO Organization(id,name,slug,type,updatedAt) VALUES('file-company','Synthetic company','file-company','COMPANY',CURRENT_TIMESTAMP)");
  sql.exec("INSERT INTO User(id,email,updatedAt) VALUES('file-owner','upgrade@files.invalid',CURRENT_TIMESTAMP)");
  sql.exec("INSERT INTO NiceJobsKnowledge(id,companyId,kind,createdByUserId) VALUES('legacy-resource','file-company','RESOURCE','file-owner')");
  sql.exec("INSERT INTO NiceJobsKnowledgeVersion(id,contentId,number,organizationId,audience,ownerUserId,title,summary,purpose,resourceType,body,updatedAt) VALUES('legacy-version','legacy-resource',1,'file-company','COMPANY','file-owner','Existing synthetic resource','Original description','Preservation only','REFERENCE','Original text',CURRENT_TIMESTAMP)");
  const before=sql.prepare("SELECT id,title,summary,purpose,body,revision FROM NiceJobsKnowledgeVersion").all();
  sql.prepare("VACUUM INTO ?").run(snapshot);
  sql.exec(readFileSync(join("prisma/migrations",folders[target],"migration.sql"),"utf8"));
  assert.deepEqual(sql.prepare("SELECT id,title,summary,purpose,body,revision FROM NiceJobsKnowledgeVersion").all(),before);
  const added=sql.prepare("SELECT captions,transcript FROM NiceJobsKnowledgeVersion").get();
  assert.equal(added?.captions,"");assert.equal(added?.transcript,"");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM NiceJobsContentFile").get()?.n,0);
  assert.equal(sql.prepare("PRAGMA integrity_check").get()?.integrity_check,"ok");assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(),[]);sql.close();sql=undefined;
  const restored=new DatabaseSync(snapshot);
  try { restored.exec(readFileSync(join("prisma/migrations",folders[target],"migration.sql"),"utf8"));assert.deepEqual(restored.prepare("SELECT id,title,summary,purpose,body,revision FROM NiceJobsKnowledgeVersion").all(),before); }
  finally { restored.close(); }
  const fresh=join(dir,"fresh.db"),url="file:"+fresh.replaceAll("\\","/");
  new DatabaseSync(fresh).close();
  const run=(...args:string[])=>execFileSync(process.execPath,["node_modules/prisma/build/index.js",...args],{env:{...process.env,DATABASE_URL:url},stdio:"pipe",timeout:120000});
  run("migrate","deploy");run("migrate","deploy");run("migrate","diff","--from-url",url,"--to-schema-datamodel","prisma/schema.prisma","--exit-code");
  console.log("PASS: isolated populated upgrade, preserved resource metadata, snapshot restore/re-upgrade, fresh/repeated deployment, zero schema drift and integrity/FK checks. No workspace or production database changed.");
} finally { sql?.close(); if (resolve(dir).startsWith(resolve(tmpdir(),"nicejobs-content-upgrade-"))) rmSync(dir,{recursive:true,force:true}); else { console.error("Cleanup outside owned fixture refused"); process.exitCode=1; } }
