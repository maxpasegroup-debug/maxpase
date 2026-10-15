import type { Prisma } from "@prisma/client";
import { createAccessContext } from "@/server/authorization/engine";
import { configuration } from "./input";
import { publicationIssues } from "./opportunity-configuration";
import { requiresProgramme } from "./programme-configuration";
import { curriculumIssues } from "./curriculum";

export type SetupItem = { key: string; title: string; target: string; issues: string[] };
export type ProgrammeChecklist = { required: boolean; ready: boolean; items: SetupItem[]; issues: string[] };
type Version = { configuration: string | null; description: string | null; engagement: string; template: { code: string }; areas: { divisionId: string }[] };

export function storedConfiguration(value: string | null) {
  try {
    const parsed = configuration.safeParse(value ? JSON.parse(value) : null);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export async function programmeChecklist(db: Prisma.TransactionClient, companyId: string, version: Version): Promise<ProgrammeChecklist> {
  let raw: unknown = null;
  try { raw = version.configuration ? JSON.parse(version.configuration) : null; } catch { /* Invalid stored configuration fails closed below. */ }
  const c = storedConfiguration(version.configuration);
  const required = requiresProgramme(version.template.code, raw && typeof raw === "object" ? raw : null) || !!(c?.ojt && "stages" in c.ojt && c.ojt.curriculum);
  if (!required) return { required: false, ready: true, items: [], issues: [] };
  const items: SetupItem[] = [];
  const add = (key: string, title: string, target: string, issues: string[]) => items.push({ key, title, target, issues });
  add("disclosure", "Employer, division and working terms", "opportunity-setup", publicationIssues(c?.opportunity ?? null, version.description, version.engagement));
  if (!version.areas.length || version.areas.length > 12) items[0].issues.push("The role must have between one and twelve authorized business areas.");
  if (c?.opportunity?.legalEmployer.status === "CONFIRMED") {
    const employer = await db.companyProfile.findUnique({ where: { organizationId: companyId }, select: { legalName: true } });
    if (c.opportunity.legalEmployer.organizationId !== companyId || employer?.legalName !== c.opportunity.legalEmployer.legalName) items[0].issues.push("Verify the canonical legal employer and recruitment authority.");
  }
  if (c?.opportunity?.brandId) {
    const brand = await db.brand.findFirst({ where: { id: c.opportunity.brandId, organizationId: companyId, status: "ACTIVE", name: c.opportunity.brandLabel ?? "" }, select: { id: true } });
    if (!brand) items[0].issues.push("Verify the active brand and its employer relationship.");
  }
  const setup = c?.programmeSetup;
  const accountCache = new Map<string, Awaited<ReturnType<typeof createAccessContext>>>();
  async function authorized(id: string | null | undefined, permission: string, personId?: string | null) {
    if (!id) return false;
    let ctx = accountCache.get(id);
    if (!ctx) { ctx = await createAccessContext(id, db, undefined, { organizationId: companyId }); accountCache.set(id, ctx); }
    if (!ctx.active || !ctx.user?.personId || personId && ctx.user.personId !== personId) return false;
    if (permission === "nicejobs.job.publish" && !(await ctx.decide(permission, { organizationId: companyId })).allowed) return false;
    for (const area of version.areas) if (!(await ctx.decide(permission, { organizationId: area.divisionId })).allowed) return false;
    return version.areas.length > 0;
  }
  add("manager", "Responsible manager", "programme-setup", await authorized(setup?.managerUserId, "nicejobs.work.manage", c?.opportunity?.reportingManager.personId) && !!c?.opportunity?.reportingManager.personId ? [] : ["Nominate an active manager account linked to the reporting manager, with work management permission in every business area."]);
  const reviewers: string[] = [];
  if (!await authorized(setup?.publicationReviewerUserId, "nicejobs.job.publish")) reviewers.push("Nominate an active publication reviewer authorized in every business area.");
  if (!await authorized(setup?.ojtReviewerUserId, "nicejobs.ojt.review")) reviewers.push("Nominate an active OJT reviewer authorized in every business area.");
  if (!await authorized(setup?.readinessReviewerUserId, "nicejobs.readiness.review")) reviewers.push("Nominate an active readiness reviewer authorized in every business area.");
  add("reviewers", "Authorized publication and training reviewers", "programme-setup", reviewers);
  add("approvals", "Engagement, compensation and policy approvals", "programme-setup", [
    ...(!setup?.engagementApproval ? ["Record the engagement approval evidence / reference."] : []),
    ...(!setup?.compensationApproval ? ["Record compensation, incentive and payment-term approval evidence / reference."] : []),
    ...(!setup?.policyApproval ? ["Record the legal / policy review evidence for the current policy versions."] : [])
  ]);
  add("orientation", "Role orientation and versioned policies", "orientation-setup", c?.preOfferRequired === true && c.preOffer ? [] : ["Require and configure the role video, scored comprehension check and versioned policies."]);
  add("outcomes", "Training outcomes", "programme-setup", setup?.trainingOutcomes ? [] : ["Define the role's training outcomes and readiness expectations."]);
  const ojt = c?.ojt && "stages" in c.ojt ? c.ojt : null;
  const curriculum = curriculumIssues(ojt);
  if (!c?.orientation || !("modules" in c.orientation) || !c.readiness?.requireAssessment) curriculum.push("Configure post-offer orientation and assessment-backed readiness.");
  if (ojt?.curriculum) {
    const refs = [...new Set(ojt.stages.flatMap(s=>s.activities.flatMap(a=>a.reference?[a.reference]:[])))];
    const resources = refs.length ? await db.niceJobsKnowledgeVersion.findMany({where:{id:{in:refs},content:{companyId,kind:"RESOURCE"},visibility:"WORKER",status:"PUBLISHED",privateReference:{not:null},resourceType:{in:["PDF","IMAGE","VIDEO","AUDIO"]}},select:{id:true,organizationId:true,audience:true,jobId:true,jobVersionId:true,privateReference:true,effectiveAt:true,expiresAt:true},take:100}) : [];
    const files = resources.length ? await db.niceJobsContentFile.findMany({where:{id:{in:resources.flatMap(r=>r.privateReference?[r.privateReference]:[])},companyId},select:{id:true,organizationId:true},take:100}) : [];
    for(const reviewerId of new Set([setup?.ojtReviewerUserId,setup?.publicationReviewerUserId])) if(refs.length){
      if(!reviewerId || !await authorized(reviewerId,"nicejobs.knowledge.read")) curriculum.push("Curriculum reviewers need current source read permission for the learning files.");
      else for(const resource of resources) if(!(await accountCache.get(reviewerId)!.decide("nicejobs.knowledge.read",{organizationId:resource.organizationId})).allowed){curriculum.push("Curriculum reviewers cannot read a learning file's scope.");break;}
    }
    const v = version as Version & {id?:string;templateId?:string};
    for (const id of refs) {
      const r=resources.find(r=>r.id===id), current=new Date();
      if (!r || !files.some(f=>f.id===r.privateReference && f.organizationId===r.organizationId) || r.effectiveAt && r.effectiveAt>current || r.expiresAt && r.expiresAt<=current || !version.areas.every(a=>r.audience==="COMPANY" && r.organizationId===companyId || r.organizationId===a.divisionId && (r.audience==="DIVISION" || r.audience==="JOB" && r.jobId===v.templateId || r.audience==="JOB_VERSION" && r.jobVersionId===v.id))) curriculum.push("A learning file is unavailable or does not cover every role area.");
    }
  }
  add("curriculum", "Complete and review the Day 1-100 schedule", "training-setup", curriculum);
  if (!c) items[0].issues.push("The saved configuration is missing or invalid.");
  const issues = items.flatMap(item => item.issues);
  return { required, ready: issues.length === 0, items, issues };
}
