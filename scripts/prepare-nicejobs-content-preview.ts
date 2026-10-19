import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { hashPassword } from "@/server/auth/password";
import { DatabaseSync } from "node:sqlite";

async function main() {
  const base=resolve(".private/content-preview");mkdirSync(base,{recursive:true,mode:0o700});
  const directory=mkdtempSync(join(base,"isolated-")),databaseUrl="file:"+join(directory,"preview.db").replaceAll("\\","/");
  new DatabaseSync(join(directory,"preview.db")).close();
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:{...process.env,DATABASE_URL:databaseUrl},stdio:"pipe",timeout:120000});
  const db=new PrismaClient({datasourceUrl:databaseUrl});
  const accounts: {purpose:string;email:string;password:string}[]=[];
  try {
    await db.$transaction(initializeGroupStructure);
    for (const p of workforcePermissions) await db.permission.upsert({where:{key:p.key},update:{},create:p});
    await db.permission.upsert({where:{key:"organization.read"},update:{},create:{key:"organization.read",name:"Read organization",scope:"GROUP"}});
    const company=await db.organization.findUniqueOrThrow({where:{slug:"aira-skill-city"}});
    for (const purpose of ["author","reviewer","publisher"]) {
      const email=purpose+"@content-preview.invalid",password="Preview-"+randomBytes(12).toString("base64url");
      const person=await db.person.create({data:{displayName:"ISOLATED CONTENT "+purpose.toUpperCase(),metadata:JSON.stringify({isolatedContentPreview:true})}});
      await db.user.create({data:{email,personId:person.id,passwordHash:await hashPassword(password),timezone:"Asia/Calcutta"}});
      const keys=purpose==="author"?workforcePermissions.filter(p=>p.key.startsWith("nicejobs.")||p.key==="person.read").map(p=>p.key):["nicejobs.command.read","nicejobs.knowledge.read",purpose==="reviewer"?"nicejobs.knowledge.review":"nicejobs.knowledge.publish","nicejobs.job.read","nicejobs.worker.read","person.read"];
      const permissions=[...new Set([...keys,"organization.read"])].map(key=>({permission:{connect:{key}}}));
      const role=await db.role.create({data:{key:"isolated-content-"+purpose,name:"Isolated preview "+purpose,organizationId:company.id,permissions:{create:permissions}}});
      await db.membership.create({data:{personId:person.id,organizationId:company.id,scope:"DESCENDANTS",roles:{create:{roleId:role.id}}}});
      accounts.push({purpose,email,password});
    }
  } finally {await db.$disconnect();}
  const runtime=join(directory,"runtime.json");
  writeFileSync(runtime,JSON.stringify({purpose:"NICEJOBS_CONTENT_PREVIEW_ONLY",DATABASE_URL:databaseUrl,NICEJOBS_CONTENT_DIR:join(directory,"objects"),AUTH_SECRET:randomBytes(32).toString("base64url"),AUTH_COOKIE_NAME:"maxpase_content_preview",AUTH_COOKIE_SECURE:"false",APP_ORIGIN:"http://127.0.0.1:3009"},null,2),{flag:"wx",mode:0o600});
  const access=join(directory,"preview-accounts.json");writeFileSync(access,JSON.stringify(accounts,null,2),{flag:"wx",mode:0o600});
  console.log("ISOLATED local content preview prepared. No existing database was read, copied or changed; no jobs/offers/workers/financial policies were created.");
  console.log("Runtime configuration: "+runtime);console.log("Temporary test accounts: "+access);
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Preview setup failed");process.exitCode=1;});
