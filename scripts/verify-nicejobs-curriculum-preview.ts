import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

async function main(){
  const directory=resolve(".private/content-preview/isolated-FAkkgN");
  const runtime=JSON.parse(readFileSync(join(directory,"runtime.json"),"utf8"));
  assert.equal(runtime.purpose,"NICEJOBS_CONTENT_PREVIEW_ONLY");
  assert.equal(runtime.DATABASE_URL,"file:"+join(directory,"preview.db").replaceAll("\\","/"));
  assert.equal(runtime.APP_ORIGIN,"http://127.0.0.1:3009");assert.equal(runtime.AUTH_COOKIE_NAME,"maxpase_content_preview");
  for(const key of ["DATABASE_URL","NICEJOBS_CONTENT_DIR","AUTH_SECRET","AUTH_COOKIE_NAME","AUTH_COOKIE_SECURE","APP_ORIGIN"])process.env[key]=runtime[key];
  const {createNiceJobsService}=await import("@/server/nicejobs/service"),{createAuthenticationService}=await import("@/server/auth/service"),{emptyCurriculum}=await import("@/server/nicejobs/curriculum");
  const db=new PrismaClient({datasourceUrl:runtime.DATABASE_URL}),auth=createAuthenticationService(db);let token:string|undefined;
  try{
    const accounts=JSON.parse(readFileSync(join(directory,"preview-accounts.json"),"utf8")) as {purpose:string;email:string;password:string}[];
    const account=accounts.find(a=>a.purpose==="author");assert(account && account.email==="author@content-preview.invalid");
    const signed=await auth.login({email:account.email,password:account.password},runtime.AUTH_SECRET);assert(signed);token=signed.token;
    const jobs=createNiceJobsService(db),division=await db.organization.findUniqueOrThrow({where:{slug:"aira-labs"}});
    let version=await db.niceJobsVersion.findFirst({where:{template:{code:"ISOLATED-CURRICULUM"}},orderBy:{number:"desc"}});
    if(!version)version=await jobs.create(signed.session.userId,{code:"ISOLATED-CURRICULUM",title:"ISOLATED curriculum editor / Not a real job",description:"Synthetic preview only",divisionIds:[division.id],configuration:{schemaVersion:1,ojt:emptyCurriculum()}});
    const detail=await jobs.detail(signed.session.userId,version.id);assert.equal(detail.setup.ready,false);assert.equal(detail.version.status,"DRAFT");assert.equal(detail.version.publishedAt,null);
    const path="/app/nicejobs?view=templates&versionId="+encodeURIComponent(version.id);
    const response=await fetch(runtime.APP_ORIGIN+path,{headers:{Cookie:runtime.AUTH_COOKIE_NAME+"="+token},redirect:"manual",signal:AbortSignal.timeout(120000)});
    assert.equal(response.status,200);const html=await response.text();
    for(const label of ["100-day curriculum","Incomplete draft","Participant preview","Day 10","Learning content","Evidence requirements","Upload and review training files"])assert(html.includes(label),"Missing preview UI: "+label);
    console.log("PASS: isolated authenticated HTTP curriculum workspace renders stage/day controls, validation, participant preview command and secure library link. Synthetic role remains DRAFT with no offers, workers or financial configuration.");
    console.log("Preview workspace: "+runtime.APP_ORIGIN+path);
  }finally{if(token)await auth.revoke(token,runtime.AUTH_SECRET);await db.$disconnect();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Curriculum preview failed");process.exitCode=1;});
