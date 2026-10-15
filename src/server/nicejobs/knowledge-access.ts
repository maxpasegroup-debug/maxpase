import type { Prisma } from "@prisma/client";
import type { Context } from "@/server/domain/operations-scope";
import type { knowledgeKinds } from "./knowledge-input";
export type KnowledgeKind = typeof knowledgeKinds[number];
export const knowledgeCapability = (kind: string) => kind === "SOP" ? "nicejobs.sop.read" : kind === "RESOURCE" ? "nicejobs.resource.read" : "nicejobs.message.read";
export type KnowledgeWorker = { id:string; divisionId:string; versionId:string; managerId:string|null; version:{templateId:string} };
export function workerKnowledgeWhere(ctx: Context, a: KnowledgeWorker, companyId:string, kind:KnowledgeKind, now:Date, current = true): Prisma.NiceJobsKnowledgeVersionWhereInput {
  return { content:{companyId,kind},organizationId:{in:ctx.organizationIds(knowledgeCapability(kind)).filter(id=>id===companyId||id===a.divisionId)},visibility:"WORKER",publishedAt:{not:null},...(current?{status:"PUBLISHED",current:true}:{status:{in:["PUBLISHED","ARCHIVED"]}}),AND:[{OR:[{effectiveAt:null},{effectiveAt:{lte:now}}]},{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}],OR:[{audience:"COMPANY",organizationId:companyId},{audience:"DIVISION",organizationId:a.divisionId},{audience:"JOB",jobId:a.version.templateId},{audience:"JOB_VERSION",jobVersionId:a.versionId},{audience:"ASSIGNMENT",assignmentId:a.id},...(a.managerId?[{audience:"MANAGER_GROUP",managerId:a.managerId}]:[])] };
}
export const knowledgeSummary = {id:true,contentId:true,number:true,revision:true,title:true,summary:true,status:true,priority:true,requiredAck:true,effectiveAt:true,expiresAt:true,reviewAt:true,publishedAt:true,updatedAt:true,resourceType:true,organizationId:true,audience:true,content:{select:{kind:true}},job:{select:{code:true}},jobVersion:{select:{title:true,number:true}}} satisfies Prisma.NiceJobsKnowledgeVersionSelect;
export async function workerKnowledgeSnapshot(db:Prisma.TransactionClient,ctx:Context,a:KnowledgeWorker,companyId:string,now:Date) {
  const result = [];
  for (const kind of ["SOP","RESOURCE","COMMUNICATION"] as const) {
    const sourceWhere=workerKnowledgeWhere(ctx,a,companyId,kind,now);
    if (!sourceWhere.organizationId || !(sourceWhere.organizationId as {in:string[]}).in.length) {result.push({kind,status:"NOT_AUTHORIZED",unread:null,pendingAcknowledgements:null,records:[]});continue;}
    const where:Prisma.NiceJobsKnowledgeVersionWhereInput=kind==="COMMUNICATION"?{AND:[sourceWhere,{receipts:{none:{assignmentId:a.id,archivedAt:{not:null}}}}]}:sourceWhere;
    const records=await db.niceJobsKnowledgeVersion.findMany({where,select:{...knowledgeSummary,body:true,communicationType:true,communicationTemplate:{select:{body:true}},steps:{select:{title:true,instruction:true,checklist:true,warning:true,escalation:true},orderBy:{order:"asc"},take:5},receipts:{where:{assignmentId:a.id},select:{readAt:true,acknowledgedAt:true},take:1}},orderBy:[{publishedAt:"desc"},{id:"desc"}],take:5});
    const unread=kind==="COMMUNICATION"?await db.niceJobsKnowledgeVersion.count({where:{AND:[where,{receipts:{none:{assignmentId:a.id,readAt:{not:null}}}}]}}):null;
    const pendingAcknowledgements=await db.niceJobsKnowledgeVersion.count({where:{AND:[where,{requiredAck:true,receipts:{none:{assignmentId:a.id,acknowledgedAt:{not:null}}}}]}});
    result.push({kind,status:records.length?"AVAILABLE":"EMPTY",unread,pendingAcknowledgements,records:records.map(r=>({...r,body:r.communicationTemplate?.body??r.body,communicationTemplate:undefined}))});
  }
  return result;
}
