import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, copyFileSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createContentFiles } from "@/server/nicejobs/content-files";
import { privateContentStorage } from "@/server/nicejobs/content-storage";
import { validateContentFile, MAX_CONTENT_BYTES } from "@/server/nicejobs/content-validation";
import { createKnowledgeService } from "@/server/nicejobs/knowledge";
import { unavailableAttachments } from "@/server/communications/providers";
import { createNiceJobsService } from "@/server/nicejobs/service";

const dir = mkdtempSync(join(tmpdir(), "nicejobs-files-")), file = join(dir, "test.db"), storage = privateContentStorage(join(dir, "objects"));
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") }), files = createContentFiles(db, storage), knowledge = createKnowledgeService(db, () => new Date(), unavailableAttachments, storage);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=", "base64");
const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
let company: string, division: string, foreign: string, author: string, reviewer: string, publisher: string, outsider: string, reader: string;
async function human(name: string, org: string, keys: string[], descendants = false) {
  const p = await db.person.create({ data: { displayName: name } }), u = await db.user.create({ data: { email: name + "@files.invalid", personId: p.id } });
  const role = await db.role.create({ data: { organizationId: org, key: p.id, name: "Fixture title is not authority", permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { personId: p.id, organizationId: org, scope: descendants ? "DESCENDANTS" : "ORGANIZATION", roles: { create: { roleId: role.id } } } }); return u.id;
}
const upload = (actor = author, organizationId = division, key = crypto.randomUUID(), bytes = png, filename = "lesson.png", mime = "image/png") => files.upload(actor, { organizationId, idempotencyKey: key, filename, mime }, bytes);
const command = (operation: string, data: object) => ({ operation, confirmed: true, idempotencyKey: crypto.randomUUID(), ...data });
async function draft(id: string, extra = {}) { return knowledge.mutate(author, command("CREATE", { kind: "RESOURCE", payload: { title: "Synthetic private lesson", summary: "Isolated content fixture", captions: "Synthetic image caption", audience: "DIVISION", organizationId: division, resourceType: "IMAGE", privateReference: id, ...extra } })); }
beforeAll(async () => {
  const sql = new DatabaseSync(file); for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8")); sql.close();
  await db.$transaction(initializeGroupStructure);
  for (const p of workforcePermissions) await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  company = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  division = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  foreign = (await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } })).id;
  const manage = ["nicejobs.knowledge.read", "nicejobs.knowledge.manage", "nicejobs.job.create", "nicejobs.job.read", "nicejobs.job.edit"];
  author = await human("file-author", company, manage, true);
  reviewer = await human("file-reviewer", division, ["nicejobs.knowledge.read", "nicejobs.knowledge.review"]);
  publisher = await human("file-publisher", division, ["nicejobs.knowledge.read", "nicejobs.knowledge.publish"]);
  reader = await human("file-reader", division, ["nicejobs.knowledge.read"]);
  outsider = await human("foreign-file-admin", foreign, manage, true);
}, 30000);
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
describe("Secure content uploads", () => {
  it("restores a quiesced database/media pair with intact manifests, content hashes and access controls",async()=>{
    const uploaded=await upload(),content=await draft(uploaded.id);
    const recovery=join(dir,"isolated-recovery");mkdirSync(recovery,{mode:0o700});
    const snapshot=join(recovery,"snapshot.db"),restored=join(recovery,"restored.db"),objects=join(recovery,"objects");mkdirSync(objects,{mode:0o700});
    const result=execFileSync(process.execPath,["--import","tsx","scripts/backup-sqlite.ts",file,snapshot],{encoding:"utf8",timeout:30000});
    expect(result).toContain("PASS consistent SQLite snapshot");
    copyFileSync(snapshot,restored);
    for(const name of readdirSync(join(dir,"objects")))copyFileSync(join(dir,"objects",name),join(objects,name));
    const sql=new DatabaseSync(restored,{readOnly:true});
    try{expect(sql.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);}finally{sql.close();}
    const recoveredDb=new PrismaClient({datasourceUrl:"file:"+restored.replaceAll("\\","/")}),recoveredFiles=createContentFiles(recoveredDb,privateContentStorage(objects));
    try{
      expect((await recoveredFiles.download(author,content.id!,true)).bytes).toEqual(png);
      expect(await recoveredDb.niceJobsContentFile.findUnique({where:{id:uploaded.id}})).toEqual(await db.niceJobsContentFile.findUnique({where:{id:uploaded.id}}));
      await expect(recoveredFiles.download(outsider,content.id!,true)).rejects.toThrow();
      const object=join(objects,uploaded.id+".blob"),held=join(objects,uploaded.id+".held");
      renameSync(object,held);
      try{await expect(recoveredFiles.download(author,content.id!,true)).rejects.toThrow();}
      finally{renameSync(held,object);}
      expect((await recoveredFiles.download(author,content.id!,true)).bytes).toEqual(png);
      await recoveredDb.user.update({where:{id:author},data:{status:"SUSPENDED"}});
      await expect(recoveredFiles.download(author,content.id!,true)).rejects.toThrow();
      expect((await db.user.findUniqueOrThrow({where:{id:author}})).status).toBe("ACTIVE");
    }finally{await recoveredDb.$disconnect();}
    expect((await files.download(author,content.id!,true)).bytes).toEqual(png);
  },60000);
  it("detects supported bytes and rejects forged types, paths, unsafe PDFs and oversized files", async () => {
    expect(await validateContentFile("lesson.png", "image/png", png)).toMatchObject({ mime: "image/png", mediaType: "IMAGE" });
    expect(await validateContentFile("policy.pdf", "application/pdf", pdf)).toMatchObject({ mediaType: "PDF" });
    for (const name of ["../lesson.png", "a\\lesson.png", "bad:lesson.png", "lesson.png.exe", "\0.png"]) await expect(validateContentFile(name, "image/png", png)).rejects.toThrow();
    await expect(validateContentFile("lesson.jpg", "image/jpeg", png)).rejects.toThrow();
    await expect(validateContentFile("lesson.png", "text/html", png)).rejects.toThrow();
    await expect(validateContentFile("lesson.svg", "image/svg+xml", Buffer.from("<svg/>"))).rejects.toThrow();
    await expect(validateContentFile("lesson.png", "image/png", Buffer.alloc(MAX_CONTENT_BYTES + 1))).rejects.toThrow();
    await expect(validateContentFile("policy.pdf", "application/pdf", Buffer.from("%PDF-1.4\n/JavaScript (evil)\n%%EOF"))).rejects.toThrow();
  });
  it("uploads only for explicit active scope, stores opaque objects, and deduplicates exact retries", async () => {
    const key = crypto.randomUUID(), first = await upload(author, division, key);
    expect(await storage.read(first.id)).toEqual(png);
    expect(readdirSync(join(dir, "objects"))).toContain(first.id + ".blob");
    expect((await upload(author, division, key)).id).toBe(first.id);
    await expect(upload(author, division, key, pdf, "policy.pdf", "application/pdf")).rejects.toThrow("retry does not match");
    await expect(upload(reader)).rejects.toThrow(); await expect(upload(outsider)).rejects.toThrow(); await expect(upload(author, foreign)).rejects.toThrow();
    await expect(files.upload(author, { organizationId: division, idempotencyKey: crypto.randomUUID(), filename: "lesson.png", mime: "image/png", actorUserId: outsider }, png)).rejects.toThrow();
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: first.id, action: "nicejobs.content.uploaded" } });
    expect(audit.actorUserId).toBe(author); expect(audit.organizationId).toBe(division);
  });
  it("allows guarded draft preview but denies foreign accounts and nonactivated participants", async () => {
    const uploaded = await upload(), content = await draft(uploaded.id);
    expect((await files.download(author, content.id!, true)).bytes).toEqual(png);
    await expect(files.download(outsider, content.id!, true)).rejects.toThrow();
    await expect(files.download(reader, content.id!, false)).rejects.toThrow();
    await expect(files.download(author, content.id!, false)).rejects.toThrow();
    expect((await knowledge.detail(author, content.id!, true)).file?.filename).toBe("lesson.png");
    await expect(draft(uploaded.id, { organizationId: company, audience: "COMPANY" })).rejects.toThrow();
    await expect(draft(uploaded.id, { resourceType: "VIDEO" })).rejects.toThrow();
  });
  it("preserves independent review, descriptions/captions and immutable published versions", async () => {
    const uploaded = await upload(), content = await draft(uploaded.id, { captions: "" });
    await expect(knowledge.mutate(author, command("SUBMIT", { versionId: content.id, revision: 0 }))).rejects.toThrow("image caption");
    await knowledge.mutate(author, command("EDIT", { versionId: content.id, revision: 0, payload: { title: "Reviewed file", summary: "Synthetic description", captions: "Accessible image description", audience: "DIVISION", organizationId: division, resourceType: "IMAGE", privateReference: uploaded.id } }));
    await knowledge.mutate(author, command("SUBMIT", { versionId: content.id, revision: 1 }));
    await expect(knowledge.mutate(author, command("REVIEW", { versionId: content.id, revision: 2, reason: "Self review" }))).rejects.toThrow();
    await knowledge.mutate(reviewer, command("REVIEW", { versionId: content.id, revision: 2, reason: "Independent fixture content review" }));
    await knowledge.mutate(publisher, command("PUBLISH", { versionId: content.id, revision: 3 }));
    const next = await knowledge.mutate(author, command("NEW_VERSION", { versionId: content.id, revision: 4 }));
    expect((await knowledge.detail(author, next.id!, true)).version).toMatchObject({ status: "DRAFT", captions: "Accessible image description" });
    await expect(knowledge.mutate(author, command("EDIT", { versionId: content.id, revision: 4, payload: { title: "Attempt", summary: "Attempt", audience: "DIVISION", organizationId: division, resourceType: "IMAGE", privateReference: uploaded.id } }))).rejects.toThrow();
  });
  it("separates customer-sharing files without creating a public URL or enabling external delivery", async () => {
    const uploaded = await upload(), content = await draft(uploaded.id, { resourceType: "CUSTOMER_MATERIAL" });
    const detail = await knowledge.detail(author, content.id!, true);
    expect(detail.version.url).toBeNull(); expect(detail.version.resourceType).toBe("CUSTOMER_MATERIAL");
    expect(detail.customerMaterial).toBeNull();
    await expect(draft(uploaded.id, { resourceType: "CUSTOMER_MATERIAL", visibility: "MANAGEMENT" })).rejects.toThrow();
  });
  it("offers genuine published uploaded files to the job training picker, excluding unresolved legacy references",async()=>{
    const uploaded = await upload(),content=await draft(uploaded.id);
    await knowledge.mutate(author,command("SUBMIT",{versionId:content.id,revision:0}));
    await knowledge.mutate(reviewer,command("REVIEW",{versionId:content.id,revision:1,reason:"Independent file review"}));
    await knowledge.mutate(publisher,command("PUBLISH",{versionId:content.id,revision:2}));
    const jobs=createNiceJobsService(db),job=await jobs.create(author,{code:"FILE-PICKER",title:"Synthetic training picker role",divisionIds:[division]});
    expect((await jobs.trainingResources(author,job.id)).some(r=>r.id===content.id)).toBe(true);
    const legacy=createKnowledgeService(db,()=>new Date(),{async authorize(){return {privateHandle:"old",mimeType:"image/png",filename:"old.png"};}},storage);
    const unresolved=await legacy.mutate(author,command("CREATE",{kind:"RESOURCE",payload:{title:"Legacy reference",summary:"Unresolved legacy storage",captions:"Legacy image",audience:"DIVISION",organizationId:division,resourceType:"IMAGE",privateReference:"legacy-reference"}}));
    await legacy.mutate(author,command("SUBMIT",{versionId:unresolved.id,revision:0}));
    await legacy.mutate(reviewer,command("REVIEW",{versionId:unresolved.id,revision:1,reason:"Legacy fixture review"}));
    await legacy.mutate(publisher,command("PUBLISH",{versionId:unresolved.id,revision:2}));
    expect((await jobs.trainingResources(author,job.id)).some(r=>r.id===unresolved.id)).toBe(false);
  });
  it("detects tampering, rechecks revoked authority on retry, and fails closed without storage", async () => {
    const key = crypto.randomUUID(), uploaded = await upload(author, division, key), content = await draft(uploaded.id);
    const mutatedStorage = { ...storage, async read() { return Buffer.from("not the original file"); } };
    await expect(createContentFiles(db, mutatedStorage).download(author, content.id!, true)).rejects.toThrow("integrity");
    await db.user.update({ where: { id: author }, data: { status: "SUSPENDED" } });
    try { await expect(upload(author, division, key)).rejects.toThrow(); } finally { await db.user.update({ where: { id: author }, data: { status: "ACTIVE" } }); }
    await expect(privateContentStorage("").available()).rejects.toThrow("not configured");
    await expect(privateContentStorage(join(process.cwd(), "public", "private-files")).available()).rejects.toThrow("outside");
  });
  it("rolls back metadata and only its newly-created object when mandatory audit insertion fails", async () => {
    const before = readdirSync(join(dir, "objects")), count = await db.niceJobsContentFile.count(), sql = new DatabaseSync(file);
    sql.exec("CREATE TRIGGER FileAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'nicejobs.content.uploaded' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    try { await expect(upload()).rejects.toThrow(); expect(await db.niceJobsContentFile.count()).toBe(count); expect(readdirSync(join(dir, "objects"))).toEqual(before); }
    finally { sql.exec("DROP TRIGGER FileAuditFailure"); sql.close(); }
  });
});
