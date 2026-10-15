import type { Prisma } from "@prisma/client";
import { AccessError,createAccessContext } from "@/server/authorization/engine";
type Context=Awaited<ReturnType<typeof createAccessContext>>;
export const trainingReminderPrefix=(id:string)=>"nicejobs-training:"+id+":";
export async function trainingReminderGuard(db:Prisma.TransactionClient,actor:Context,r:{reference:string;resourceType:string;resourceId:string;organizationId:string;recipientUserId:string},phase:"SCHEDULE"|"PROCESS"|"CANCEL"="SCHEDULE"){
  if(!r.reference.startsWith("nicejobs-training:"))return;
  const parts=r.reference.split(":");if(parts.length!==3)throw new AccessError("Training reminder source unavailable");
  const e=await db.niceJobsOnboarding.findUnique({where:{id:parts[1]},include:{plan:true,offer:true,application:{include:{area:{include:{division:true,version:{include:{template:{include:{product:{include:{division:true}},company:{include:{company:true}}}}}}}}}}}});
  const a=e?.application,t=a?.area.version.template,p=t?.product;
  if(!e || !a || t?.company.slug!=="aira-skill-city" || t.company.status!=="ACTIVE" || t.company.company?.status!=="ACTIVE" || a.companyId!==t.companyId || a.companyId!==a.area.division.parentId || a.area.division.status!=="ACTIVE" || a.divisionId!==a.area.divisionId || p?.slug!=="nice-jobs" || p.status!=="ACTIVE" || p.organizationId!==a.companyId || p.division?.slug!=="aira-career-hub" || p.division.status!=="ACTIVE" || p.division.parentId!==a.companyId || e.plan.versionId!==a.versionId || e.offer.applicationId!==a.id || e.offer.status!=="ACCEPTED" || !e.offer.acceptedAt || a.status!=="OFFER_ACCEPTED")throw new AccessError("Training reminder source unavailable");
  await actor.requireAccess("nicejobs.onboarding.read",{organizationId:a.divisionId});
  await actor.requireAccess("nicejobs.onboarding.manage",{organizationId:a.divisionId});
  if(phase!=="CANCEL" && ["READY","CANCELLED"].includes(e.status))throw new AccessError("Training reminder source is closed");
  if(r.resourceType!=="ORGANIZATION" || r.resourceId!==p.division.id || r.organizationId!==p.division.id || r.recipientUserId!==a.creatorUserId)throw new AccessError("Training reminder recipient or scope mismatch");
  if(phase==="CANCEL")return;
  const recipient=await createAccessContext(r.recipientUserId,db,undefined,{organizationId:p.division.id});
  if(!recipient.active || recipient.user?.personId!==a.candidateId)throw new AccessError("Training participant unavailable");
  for(const permission of ["nicejobs.application.self","nicejobs.onboarding.self","organization.read","notification.read"])await recipient.requireAccess(permission,{organizationId:p.division.id});
}
