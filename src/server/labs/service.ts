import { createHash } from "node:crypto";
import { z } from "zod";
import { PrismaClient, type Prisma, type ExecutiveRecord } from "@prisma/client";
import { prisma } from "@/server/db";
import { requirePortalAccess } from "@/server/portals/policy";
import { AccessError,createAccessContext } from "@/server/authorization/engine";
import { operationalEvent, notify } from "@/server/domain/operational-events";
import { createOperationsService } from "@/server/domain/operations-service";
import { createExecutionService } from "@/server/domain/execution-service";
import { leadInput, leadPayload, leadStates, quoteInput, quotePayload, quoteTotals, billingConfig } from "./input";
import { buildAuditEventData } from "@/server/audit/audit-service";

type DB = Prisma.TransactionClient;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const command = z.object({ id: z.string().min(1).max(200), version: z.number().int().min(0), reference: z.string().min(8).max(100) });
const paths: Record<string, string[]> = { NEW: ["NEW", "CONTACTED", "LOST"], CONTACTED: ["CONTACTED", "QUALIFIED", "LOST"], QUALIFIED: ["QUALIFIED", "AUDIT", "LOST"], AUDIT: ["AUDIT", "QUOTATION_READY", "LOST"], QUOTATION_READY: ["QUOTATION_READY", "WON", "LOST"] };
export function createLabsService(client: PrismaClient = prisma, now = () => new Date(), portal: "labs" | "skillcity" = "labs") {
  const operations = createOperationsService(client), execution = createExecutionService(client);
  async function access(db: DB, userId: string, key?: string) {
    const gateway = await requirePortalAccess(db, userId, portal);
    const result = portal === "labs" ? gateway : await (async () => {
      const division = await db.organization.findUnique({ where: { slug: "aira-labs" }, select: { id: true, parentId: true, type: true, status: true } });
      if (!division || division.parentId !== gateway.companyId || division.type !== "DIVISION" || division.status !== "ACTIVE") throw new AccessError("Labs scope unavailable");
      const ctx = await createAccessContext(userId, db, undefined, { organizationId: division.id });
      await ctx.requireAccess("organization.read", { organizationId: division.id });
      return { ...gateway, divisionId: division.id, ctx };
    })();
    if (key) await result.ctx.requireAccess(key, { organizationId: result.divisionId });
    if (key === "labs.sales.manage") await result.ctx.requireAccess("labs.sales.read", { organizationId: result.divisionId });
    return result;
  }
  async function owned(db: DB, userId: string, id: string, kind: string, key?: string) {
    const a = await access(db, userId, key), row = await db.executiveRecord.findUnique({ where: { id } });
    if (!row || row.kind !== kind || row.organizationId !== a.divisionId) throw new AccessError("Record unavailable");
    const related=kind==="LABS_QUOTE"?await db.executiveRecord.findFirst({where:{id:quotePayload.parse(JSON.parse(row.payload)).input.leadId,kind:"LABS_LEAD",organizationId:a.divisionId}}):null;
    if(kind==="LABS_QUOTE"&&!related)throw new AccessError("Quotation source unavailable");
    if (!(await a.ctx.decide("labs.sales.read", { organizationId: a.divisionId })).allowed) {
      await a.ctx.requireAccess("labs.sales.self", { organizationId: a.divisionId });
      if (row.ownerPersonId !== a.ctx.user!.personId || related&&related.ownerPersonId!==a.ctx.user!.personId) throw new AccessError("Record unavailable");
    }
    return { a, row };
  }
  async function event(db: DB, userId: string | null, row: { organizationId: string; id: string }, action: string, reference?: string, metadata?: Prisma.InputJsonObject) {
    const user = userId ? await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } }) : null;
    return operationalEvent(db, { actorUserId: userId, actorPersonId: user?.personId, organizationId: row.organizationId, action, entityType: "AiraLabsRecord", entityId: row.id, reference, result: "SUCCESS", metadata });
  }
  async function replay(db: DB, userId: string, row: ExecutiveRecord, ref: string, raw: unknown) {
    const reference = "labs:" + digest([row.id, userId, ref]);
    const previous = await db.operationalEvent.findUnique({ where: { reference } });
    if (previous && JSON.parse(previous.metadata ?? "{}").fingerprint !== digest(raw)) throw new AccessError("Duplicate command has different input");
    return { reference, previous, fingerprint: digest(raw) };
  }
  async function change(db: DB, userId: string, row: ExecutiveRecord, version: number, status: string, payload: unknown, reason: string) {
    const result = await db.executiveRecord.updateMany({ where: { id: row.id, version }, data: { status, payload: JSON.stringify(payload), version: { increment: 1 }, ...(row.kind === "LABS_LEAD" ? { dueAt: leadPayload.parse(payload).nextFollowUp ? new Date(leadPayload.parse(payload).nextFollowUp!) : null } : {}) } });
    if (result.count !== 1) throw new AccessError("Record changed; refresh before acting");
    await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: status, reason } });
  }
  async function createLead(userId: string, raw: unknown) {
    const data = leadInput.parse(raw);
    return client.$transaction(async db => {
      const a = await access(db, userId, "labs.sales.manage");
      const sourceKey = "labs:lead:" + digest([a.divisionId, data.email, data.company.toLowerCase()]);
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey } });
      if (existing) return {...existing,duplicate:true};
      const row = await db.executiveRecord.create({ data: { kind: "LABS_LEAD", organizationId: a.divisionId, ownerPersonId: a.ctx.user!.personId!, title: data.company + " / " + data.name, status: "NEW", sourceKey, payload: JSON.stringify({ ...data, ownerUserId: userId, nextFollowUp: null, lastContact: null, outcome: "", qualification: "", quoteId: null, acceptance: "", projectId: null }) } });
      await event(db, userId, row, "labs.lead_created", undefined, { channel: "MANUAL" });
      // Internal alert only; this neither sends email nor asserts external delivery.
      await notify(db, userId, userId, { organizationId: a.divisionId, resourceType: "ORGANIZATION", resourceId: a.divisionId }, "LABS_ENQUIRY", "New Labs enquiry", "Review your AIRA Labs sales queue.", "labs-enquiry:" + row.id);
      return {...row,duplicate:false};
    });
  }
  async function enquire(raw: unknown) {
    const data = leadInput.parse(raw);
    await client.$transaction(async db => {
      const config = await db.systemConfiguration.findUnique({ where: { key: "AIRALABS_INTAKE" } });
      if (!config || !z.object({ enabled: z.literal(true) }).strict().safeParse(JSON.parse(config.value)).success) throw new AccessError("Enquiries are not configured. Please try again later.");
      const division = await db.organization.findUnique({ where: { slug: "aira-labs" }, include: { parent: { include: { company: true } } } });
      if (!division || division.type !== "DIVISION" || division.status !== "ACTIVE" || division.parent?.slug !== "aira-skill-city" || division.parent.status !== "ACTIVE" || division.parent.company?.status !== "ACTIVE") throw new AccessError("Enquiries are unavailable");
      let ancestor=division.parent.parentId;const seen=new Set<string>();while(ancestor){if(seen.has(ancestor)||seen.size>=16)throw new AccessError("Enquiries are unavailable");seen.add(ancestor);const node=await db.organization.findUnique({where:{id:ancestor},select:{parentId:true,status:true}});if(!node||node.status!=="ACTIVE")throw new AccessError("Enquiries are unavailable");ancestor=node.parentId;}
      const reference = "labs:enquiry:" + digest([division.id, {...data,source:"WEBSITE",company:data.company.toLowerCase()}]);
      if (await db.operationalEvent.findUnique({ where: { reference } })) return;
      const audit = await db.auditEvent.create({ data: buildAuditEventData({ organizationId: division.id, action: "labs.enquiry_received", entityType: "AiraLabsEnquiry", result: "SUCCESS", metadata: { channel: "PUBLIC_ENQUIRY", assignment: "UNASSIGNED" } }) });
      await db.operationalEvent.create({ data: { organizationId: division.id, eventType: "labs.enquiry_received", entityType: "AiraLabsEnquiry", entityId: audit.id, status: "PENDING", reference, auditId: audit.id, metadata: JSON.stringify({ ...data, source: "WEBSITE" }) } });
    });
  }
  async function assignEnquiry(userId: string, enquiryId: string, ownerUserId: string) {
    return client.$transaction(async db => {
      const a = await access(db, userId, "labs.sales.manage");
      const owner = await access(db, ownerUserId, "labs.sales.self");
      const enquiry = await db.operationalEvent.findUnique({ where: { id: enquiryId } });
      if (!enquiry || enquiry.organizationId !== a.divisionId || enquiry.eventType !== "labs.enquiry_received") throw new AccessError("Enquiry unavailable");
      const data = leadInput.parse(JSON.parse(enquiry.metadata ?? "{}"));
      const sourceKey = "labs:lead:" + digest([a.divisionId, data.email, data.company.toLowerCase()]);
      const old = await db.executiveRecord.findUnique({ where: { sourceKey } });
      if (old) { if(enquiry.status!=="SUCCEEDED")throw new AccessError("An existing lead has this contact; review it before assignment"); if (leadPayload.parse(JSON.parse(old.payload)).ownerUserId !== ownerUserId) throw new AccessError("Enquiry was assigned to another account"); return old; }
      if (enquiry.status !== "PENDING") throw new AccessError("Enquiry is not pending assignment");
      const duplicate = await db.executiveRecord.findFirst({ where: { organizationId: a.divisionId, kind: "LABS_LEAD", sourceKey: "labs:lead:" + digest([a.divisionId, data.email, data.company.toLowerCase()]) } });
      if (duplicate) throw new AccessError("An existing lead has this contact; review it before assignment");
      const row = await db.executiveRecord.create({ data: { kind: "LABS_LEAD", organizationId: a.divisionId, ownerPersonId: owner.ctx.user!.personId!, title: data.company + " / " + data.name, status: "NEW", sourceKey, payload: JSON.stringify({ ...data, ownerUserId, nextFollowUp: null, lastContact: null, outcome: "", qualification: "", quoteId: null, acceptance: "", projectId: null }) } });
      await db.operationalEvent.update({ where: { id: enquiryId }, data: { status: "SUCCEEDED" } });
      await event(db, userId, row, "labs.enquiry_assigned", undefined, {enquiryId});
      await notify(db, userId, ownerUserId, { organizationId: a.divisionId, resourceType: "ORGANIZATION", resourceId: a.divisionId }, "LABS_ENQUIRY", "Labs enquiry assigned", "Review your AIRA Labs sales queue.", "labs-enquiry:" + row.id);
      return row;
    });
  }
  async function updateLead(userId: string, raw: unknown) {
    const data = command.extend({ status: z.enum(leadStates), outcome: z.string().trim().min(1).max(3000), qualification: z.string().trim().max(3000), nextFollowUp: z.string().datetime().nullable() }).strict().parse(raw);
    return client.$transaction(async db => {
      const { a, row } = await owned(db, userId, data.id, "LABS_LEAD", "labs.sales.perform");
      const token = await replay(db, userId, row, data.reference, data); if (token.previous) return;
      const payload = leadPayload.parse(JSON.parse(row.payload));
      if (!paths[row.status]?.includes(data.status)) throw new AccessError("Invalid pipeline transition");
      if (["QUALIFIED", "AUDIT", "QUOTATION_READY", "WON"].includes(data.status) && data.qualification.length < 10) throw new AccessError("Record qualification evidence");
      if (data.status === "WON") throw new AccessError("Accept an issued approved quotation before marking Won");
      if (data.status === "QUOTATION_READY") {
        const q = payload.quoteId ? await db.executiveRecord.findUnique({ where: { id: payload.quoteId } }) : null;
        if (!q || q.organizationId !== row.organizationId || q.status !== "ISSUED") throw new AccessError("Issue an approved quotation first");
      }
      if (data.nextFollowUp && new Date(data.nextFollowUp) <= now()) throw new AccessError("Schedule a future follow-up");
      if (["LOST"].includes(data.status) && data.nextFollowUp) throw new AccessError("Closed leads cannot schedule follow-ups");
      await change(db, userId, row, data.version, data.status, { ...payload, outcome:data.outcome, qualification:data.qualification, nextFollowUp:data.nextFollowUp, lastContact: now().toISOString() }, data.outcome);
      const old = await db.reminder.findMany({ where: { organizationId: row.organizationId, reference: { startsWith: "labs-followup:" + row.id + ":" }, status: "PENDING" }, take: 100 });
      if (old.length === 100) throw new AccessError("Reminder cleanup limit exceeded");
      for (const r of old) { await db.reminder.update({ where: { id: r.id }, data: { status: "CANCELLED" } }); await event(db, userId, row, "labs.reminder_cancelled"); }
      if (data.nextFollowUp) {
        await a.ctx.requireAccess("reminder.manage", { organizationId: a.divisionId });
        const recipient = await access(db, payload.ownerUserId);
        if (recipient.ctx.user!.personId !== row.ownerPersonId) throw new AccessError("Lead ownership changed");
        await recipient.ctx.requireAccess("notification.read", { organizationId: a.divisionId });
        await db.reminder.create({ data: { organizationId: a.divisionId, resourceType: "ORGANIZATION", resourceId: a.divisionId, recipientUserId: payload.ownerUserId, remindAt: new Date(data.nextFollowUp), reason: "Review your due follow-ups in AIRA Labs.", reference: "labs-followup:" + row.id + ":" + (data.version + 1) } });
        await event(db, userId, row, "labs.reminder_scheduled");
      }
      await event(db, userId, row, "labs.lead_updated", token.reference, { fingerprint: token.fingerprint });
    });
  }
  async function quote(userId: string, raw: unknown, reference: string) {
    const data = quoteInput.parse(raw), totals = quoteTotals(data);
    z.string().min(8).max(100).parse(reference);
    if (new Date(data.expiresAt) <= now()) throw new AccessError("Quotation expiry must be future");
    return client.$transaction(async db => {
      const { a, row: lead } = await owned(db, userId, data.leadId, "LABS_LEAD", "labs.quote.prepare");
      if (["WON", "LOST"].includes(lead.status)) throw new AccessError("Closed leads cannot prepare new quotations");
      const sourceKey = "labs:quote:" + digest([userId, reference]);
      const previous = await db.executiveRecord.findUnique({ where: { sourceKey } });
      if (previous) { if (JSON.stringify(quotePayload.parse(JSON.parse(previous.payload)).input) !== JSON.stringify(data)) throw new AccessError("Quotation replay mismatch"); return previous; }
      const q = await db.executiveRecord.create({ data: { kind: "LABS_QUOTE", organizationId: a.divisionId, ownerPersonId: lead.ownerPersonId, title: "Quotation / " + lead.title, status: "DRAFT", sourceKey, payload: JSON.stringify({ input: data, totals, requestId: null, issuer: null, issuedAt: null, acceptance: "" }), dueAt: new Date(data.expiresAt) } });
      await event(db, userId, q, "labs.quote_drafted");
      return q;
    });
  }
  async function submitQuote(userId: string, raw: unknown) {
    const data = command.strict().parse(raw);
    return client.$transaction(async db => {
      const { a, row: q } = await owned(db, userId, data.id, "LABS_QUOTE", "labs.quote.prepare");
      const token = await replay(db, userId, q, data.reference, data); if (token.previous) return;
      const payload = quotePayload.parse(JSON.parse(q.payload));
      const { row: lead } = await owned(db, userId, payload.input.leadId, "LABS_LEAD");
      if (q.status !== "DRAFT" || !q.dueAt || q.dueAt <= now() || !["QUALIFIED", "AUDIT"].includes(lead.status)) throw new AccessError("Only a current draft for a qualified lead can be submitted");
      const config = await db.systemConfiguration.findUnique({ where: { key: "AIRALABS_QUOTE_CONTROL" } });
      if (!config) throw new AccessError("Quotation approval is not configured");
      const { controlPointId } = z.object({ controlPointId: z.string() }).strict().parse(JSON.parse(config.value));
      const point = await db.controlPoint.findUnique({ where: { id: controlPointId } });
      if (!point || point.organizationId !== a.divisionId || point.projectId || point.requiredPermission !== "labs.quote.issue" || point.allowSelfApproval) throw new AccessError("Independent Labs quotation policy required");
      const snapshot = { input: payload.input, totals: payload.totals };
      const request = await operations.createRequest(userId, { organizationId: a.divisionId, resourceType: "ORGANIZATION", resourceId: a.divisionId, title: "Review quotation " + q.id, description: JSON.stringify(snapshot), controlPointId, expiresAt: payload.input.expiresAt, idempotencyKey: "labs-quote:" + q.id }, undefined, db);
      await db.operationalRequest.update({where:{id:request.id},data:{type:"AIRALABS_QUOTE",payload:JSON.stringify({quoteId:q.id})}});
      await change(db, userId, q, data.version, "UNDER_REVIEW", { ...payload, requestId: request.id }, "Submitted for independent review");
      await operations.submitRequest(userId, request.id, db);
      await event(db, userId, q, "labs.quote_review_requested", token.reference, { fingerprint: token.fingerprint });
      return db.executiveRecord.findUniqueOrThrow({ where: { id: q.id } });
    });
  }
  async function issue(userId: string, raw: unknown) {
    const data = command.strict().parse(raw);
    return client.$transaction(async db => {
      const { a, row } = await owned(db, userId, data.id, "LABS_QUOTE", "labs.quote.issue");
      const token = await replay(db, userId, row, data.reference, data); if (token.previous) return;
      const q = quotePayload.parse(JSON.parse(row.payload));
      if (!q.requestId) throw new AccessError("Submit the draft for review first");
      const r = await db.operationalRequest.findUniqueOrThrow({ where: { id: q.requestId } });
      if (row.status !== "UNDER_REVIEW" || !row.dueAt || row.dueAt <= now() || r.organizationId !== a.divisionId || r.description !== JSON.stringify({ input: q.input, totals: q.totals }) || !await operations.approvedAuthority(db, r.id)) throw new AccessError("Current independent approval required");
      const config = await db.systemConfiguration.findUnique({ where: { key: "AIRALABS_BILLING" } });
      if (!config) throw new AccessError("Verified issuer and tax configuration required");
      const issuer = billingConfig.parse(JSON.parse(config.value));
      if (issuer.companyId !== a.companyId || !issuer.allowedTaxBasisPoints.includes(q.input.taxBasisPoints)) throw new AccessError("Issuer/tax configuration mismatch");
      const company=await db.companyProfile.findUnique({where:{organizationId:a.companyId}}),legal=JSON.parse(company?.metadata??"{}");
      if(!company||company.status!=="ACTIVE"||company.legalName!==issuer.legalName||legal.legalInformationVerified!==true||typeof legal.legalVerificationEvidence!=="string"||legal.legalVerificationEvidence.trim().length<10)throw new AccessError("Canonical issuer legal identity verification is required");
      await access(db, issuer.authorizedByUserId, "labs.quote.issue");
      await change(db, userId, row, data.version, "ISSUED", { ...q, issuer, issuedAt: now().toISOString() }, "Issued against current independent approval");
      const { row: lead } = await owned(db, userId, q.input.leadId, "LABS_LEAD");
      if (!["QUALIFIED", "AUDIT"].includes(lead.status)) throw new AccessError("Lead no longer open for quotation issuance");
      const p = leadPayload.parse(JSON.parse(lead.payload));
      await change(db, userId, lead, lead.version, "QUOTATION_READY", { ...p, quoteId: row.id }, "Approved quotation issued; delivery not asserted");
      await event(db, userId, row, "labs.quote_issued", token.reference, { fingerprint: token.fingerprint });
    });
  }
  async function assign(userId: string, raw: unknown) {
    const data = command.extend({ ownerUserId: z.string() }).strict().parse(raw);
    return client.$transaction(async db => {
      const { row } = await owned(db, userId, data.id, "LABS_LEAD", "labs.sales.manage");
      const token = await replay(db, userId, row, data.reference, data); if (token.previous) return;
      if (["WON", "LOST"].includes(row.status)) throw new AccessError("Closed lead ownership is read-only");
      const next = await access(db, data.ownerUserId, "labs.sales.self");
      const p = leadPayload.parse(JSON.parse(row.payload));
      await change(db, userId, row, data.version, row.status, { ...p, ownerUserId: data.ownerUserId, nextFollowUp: null }, "Lead reassigned; next follow-up needs review");
      await db.executiveRecord.update({ where: { id: row.id }, data: { ownerPersonId: next.ctx.user!.personId! } });
      const quotes=await db.$queryRaw<{id:string}[]>`SELECT id FROM ExecutiveRecord WHERE kind = 'LABS_QUOTE' AND organizationId = ${row.organizationId} AND json_extract(payload, '$.input.leadId') = ${row.id} LIMIT 1001`;
      if(quotes.length>1000)throw new AccessError("Quotation ownership transfer exceeds the safe batch limit");
      await db.executiveRecord.updateMany({where:{id:{in:quotes.map(q=>q.id)},organizationId:row.organizationId,kind:"LABS_QUOTE"},data:{ownerPersonId:next.ctx.user!.personId!}});
      await event(db, userId, row, "labs.lead_assigned", token.reference, { fingerprint: token.fingerprint, previousOwnerPersonId:row.ownerPersonId, nextOwnerPersonId:next.ctx.user!.personId!,quotationIds:quotes.map(q=>q.id) });
    });
  }
  async function decideQuote(userId: string, id: string, decision: "APPROVED" | "REJECTED", comment: string) {
    return client.$transaction(async db => {
      const { row } = await owned(db, userId, id, "LABS_QUOTE", "labs.quote.issue");
      const q = quotePayload.parse(JSON.parse(row.payload));
      if (!q.requestId) throw new AccessError("No quotation review request");
      const approval = await db.siaApproval.findFirst({ where: { requestId: q.requestId, approverUserId: userId, status: "PENDING" }, orderBy: { stageIndex: "asc" } });
      if (!approval) throw new AccessError("No approval assigned to this account");
      await operations.decide(userId, { approvalId: approval.id, decision, comment }, db);
    });
  }
  async function accept(userId: string, raw: unknown) {
    const data = command.extend({ evidence: z.string().trim().min(10).max(3000) }).strict().parse(raw);
    return client.$transaction(async db => {
      const { row } = await owned(db, userId, data.id, "LABS_QUOTE", "labs.sales.manage");
      const token = await replay(db, userId, row, data.reference, data); if (token.previous) return;
      const q = quotePayload.parse(JSON.parse(row.payload));
      if (row.status !== "ISSUED" || !row.dueAt || row.dueAt <= now()) throw new AccessError("Only an unexpired issued quotation can be accepted");
      const { row: lead } = await owned(db, userId, q.input.leadId, "LABS_LEAD");
      const p = leadPayload.parse(JSON.parse(lead.payload));
      if (lead.status !== "QUOTATION_READY" || p.quoteId !== row.id) throw new AccessError("Quotation is not the lead's current offer");
      await change(db, userId, row, data.version, "ACCEPTED", { ...q, acceptance: data.evidence }, data.evidence);
      await change(db, userId, lead, lead.version, "WON", { ...p, acceptance: data.evidence, nextFollowUp: null }, data.evidence);
      await event(db, userId, row, "labs.sale_recorded", token.reference, { fingerprint: token.fingerprint });
    });
  }
  async function startProject(userId: string, raw: unknown) {
    const data = command.extend({ scope: z.string().trim().min(10).max(3000), developerUserId: z.string(), targetDate: z.string().datetime() }).strict().parse(raw);
    return client.$transaction(async db => {
      const { a, row } = await owned(db, userId, data.id, "LABS_LEAD", "labs.delivery.manage");
      const p = leadPayload.parse(JSON.parse(row.payload));
      if (row.status !== "WON") throw new AccessError("Record an approved sale before starting delivery");
      const token = await replay(db, userId, row, data.reference, data); if (token.previous) return p.projectId;
      if (p.projectId) throw new AccessError("A linked project already exists");
      if (new Date(data.targetDate) <= now()) throw new AccessError("Target date must be future");
      const developer = await access(db, data.developerUserId,"labs.delivery.assignee");
      const project = await execution.save(userId, "projects", { organizationId: a.divisionId, name: row.title, slug: "labs-" + row.id.toLowerCase(), status: "PLANNED", description: data.scope, ownerPersonId: developer.ctx.user!.personId, accountablePersonId: a.ctx.user!.personId, targetDate: data.targetDate, metadata: { kind: "AIRALABS_PROJECT", leadId: row.id, quoteId: p.quoteId, lifecycle: "PLANNED", reviewEvidence: null, acceptanceEvidence: null } }, undefined, db);
      await change(db, userId, row, data.version, "WON", { ...p, projectId: project.id }, "Linked canonical delivery project created");
      await db.executiveRecord.update({where:{id:row.id},data:{projectId:project.id}});
      await event(db, userId, row, "labs.project_linked", token.reference, { fingerprint: token.fingerprint });
      return project.id;
    });
  }
  async function deliver(userId: string, raw: unknown) {
    const data = z.object({ projectId: z.string(), stage: z.enum(["IN_PROGRESS", "REVIEW", "CLIENT_ACCEPTANCE", "DELIVERED", "BLOCKED", "CANCELLED"]), reviewEvidence: z.string().trim().max(3000), acceptanceEvidence: z.string().trim().max(3000), reference: z.string().min(8).max(100) }).strict().parse(raw);
    return client.$transaction(async db => {
      const a = await access(db, userId, "labs.delivery.manage");
      const p = await db.project.findUnique({ where: { id: data.projectId } });
      if (!p || p.organizationId !== a.divisionId) throw new AccessError("Project unavailable");
      await a.ctx.requireAccess("project.manage", { organizationId: p.organizationId, projectId: p.id });
      const m = JSON.parse(p.metadata ?? "{}");
      if (m.kind !== "AIRALABS_PROJECT") throw new AccessError("Project unavailable");
      const reference = "labs:delivery:" + digest([p.id, userId, data.reference]), fingerprint = digest(data);
      const previous = await db.operationalEvent.findUnique({ where: { reference } });
      if (previous) { if (JSON.parse(previous.metadata ?? "{}").fingerprint !== fingerprint) throw new AccessError("Delivery replay mismatch"); return; }
      const stages: Record<string, string[]> = { PLANNED: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["REVIEW", "BLOCKED", "CANCELLED"], BLOCKED: ["IN_PROGRESS", "CANCELLED"], REVIEW: ["IN_PROGRESS", "CLIENT_ACCEPTANCE", "BLOCKED"], CLIENT_ACCEPTANCE: ["REVIEW", "DELIVERED", "BLOCKED"] };
      if (!stages[m.lifecycle]?.includes(data.stage)) throw new AccessError("Invalid delivery transition");
      if (["CLIENT_ACCEPTANCE", "DELIVERED"].includes(data.stage) && data.reviewEvidence.length < 10 || data.stage === "DELIVERED" && data.acceptanceEvidence.length < 10) throw new AccessError("Review and client acceptance evidence required");
      if (data.stage === "DELIVERED" && (await db.task.count({ where: { projectId: p.id, status: { notIn: ["COMPLETED", "CANCELLED"] } } }) || await db.executionBlocker.count({ where: { projectId: p.id, status: "OPEN" } }) || await db.milestone.count({ where: { projectId: p.id, status: { notIn: ["COMPLETED", "CANCELLED"] } } }))) throw new AccessError("Resolve delivery work and blockers first");
      const status = data.stage === "DELIVERED" ? "COMPLETED" : data.stage === "CANCELLED" ? "CANCELLED" : data.stage === "BLOCKED" ? "BLOCKED" : "ACTIVE";
      await execution.save(userId, "projects", { organizationId: p.organizationId, name: p.name, slug: p.slug, description: p.description, ownerPersonId: p.ownerPersonId, accountablePersonId: p.accountablePersonId, status, targetDate: p.targetDate, metadata: { ...m, lifecycle: data.stage, reviewEvidence: data.reviewEvidence || null, acceptanceEvidence: data.acceptanceEvidence || null } }, p.id, db);
      await event(db, userId, { organizationId: p.organizationId, id: p.id }, "labs.delivery_changed", reference, { fingerprint });
    });
  }
  async function list(userId: string, raw: unknown = {}) {
    const filter = z.object({ search: z.string().trim().max(160).default(""), status: z.enum(leadStates).optional(), due: z.enum(["TODAY", "OVERDUE"]).optional(), page: z.number().int().min(1).max(1000).default(1) }).strict().parse(raw);
    const a = await access(client, userId), scope = { organizationId: a.divisionId };
    const manager = (await a.ctx.decide("labs.sales.read", scope)).allowed;
    if (!manager) await a.ctx.requireAccess("labs.sales.self", scope);
    const base = { ...scope, kind: "LABS_LEAD", ...(!manager ? { ownerPersonId: a.ctx.user!.personId! } : {}) };
    const readAt=now(), today = new Date(readAt); today.setUTCHours(0, 0, 0, 0); const tomorrow = new Date(today.getTime() + 86400000);
    const where: Prisma.ExecutiveRecordWhereInput = { ...base, ...(filter.status ? { status: filter.status } : {}), ...(filter.search ? { title: { contains: filter.search } } : {}), ...(filter.due ? { AND:[{status:{notIn:["WON","LOST"]}}], dueAt: filter.due === "OVERDUE" ? { lt: readAt } : { gte: today, lt: tomorrow } } : {}) };
    const records = await client.executiveRecord.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (filter.page - 1) * 25, take: 25 });
    const quotes = await client.executiveRecord.findMany({ where: { ...scope, kind: "LABS_QUOTE", ...(!manager ? { ownerPersonId: a.ctx.user!.personId! } : {}) }, orderBy: { createdAt: "desc" }, take: 25 });
    const requestIds=quotes.map(q=>quotePayload.parse(JSON.parse(q.payload)).requestId).filter((id):id is string=>!!id);
    const reviews=(await a.ctx.decide("request.read",scope)).allowed&&(await a.ctx.decide("approval.read",scope)).allowed?await client.operationalRequest.findMany({where:{organizationId:a.divisionId,id:{in:requestIds}},select:{id:true,status:true,approvals:{select:{approverUserId:true,status:true,stageIndex:true,decidedAt:true,comment:true},orderBy:{createdAt:"asc"}}},take:25}):[];
    const approvalScope=createOperationsService(client,(id,db)=>createAccessContext(id,db,undefined,scope));
    const approvals=(await a.ctx.decide("approval.read",scope)).allowed?await approvalScope.list(userId,"approvals",{organizationId:a.divisionId,status:"PENDING"}):[];
    const actionable=new Set(approvals.flatMap(item=>{const row=item as {requestId?:unknown;actionable?:unknown};return typeof row.requestId==="string"&&row.actionable===true&&requestIds.includes(row.requestId)?[row.requestId]:[];}));
    const projects = await projectList(userId);
    return { divisionId: a.divisionId, companyId: a.companyId, manager, records: records.map(r => ({ ...r, data: leadPayload.parse(JSON.parse(r.payload)) })), quotes: quotes.map(r => { const data=quotePayload.parse(JSON.parse(r.payload)), review=reviews.find(item=>item.id===data.requestId); return { ...r, data, uiStatus: ["DRAFT","UNDER_REVIEW","ISSUED"].includes(r.status)&&r.dueAt&&r.dueAt<=now()?"EXPIRED":r.status==="UNDER_REVIEW"&&review?.status&&["APPROVED","REJECTED","CANCELLED","EXPIRED"].includes(review.status)?review.status:r.status, reviewHistory:review?.approvals.filter(item=>item.decidedAt).map(item=>({status:item.status,comment:item.comment,decidedAt:item.decidedAt}))??[], canDecide:!!data.requestId&&actionable.has(data.requestId) }; }), projects, total: await client.executiveRecord.count({ where }), filter, metrics: { new: await client.executiveRecord.count({ where: { ...base, status: "NEW" } }), overdue: await client.executiveRecord.count({ where: { ...base, status: { notIn: ["WON", "LOST"] }, dueAt: { lt: readAt } } }), qualified: await client.executiveRecord.count({ where: { ...base, status: "QUALIFIED" } }), won: await client.executiveRecord.count({ where: { ...base, status: "WON" } }) }, capabilities: { perform:(await a.ctx.decide("labs.sales.perform",scope)).allowed, manage: (await a.ctx.decide("labs.sales.manage", scope)).allowed, quote: (await a.ctx.decide("labs.quote.prepare", scope)).allowed, issue: (await a.ctx.decide("labs.quote.issue", scope)).allowed, delivery: (await a.ctx.decide("labs.delivery.manage", scope)).allowed }, config: { intake: !!await client.systemConfiguration.findUnique({ where: { key: "AIRALABS_INTAKE" } }), billing: !!await client.systemConfiguration.findUnique({ where: { key: "AIRALABS_BILLING" } }), quotePolicy: !!await client.systemConfiguration.findUnique({ where: { key: "AIRALABS_QUOTE_CONTROL" } }) } };
  }
  async function unassigned(userId: string) { const a = await access(client,userId,"labs.sales.manage"); return client.operationalEvent.findMany({ where:{organizationId:a.divisionId,eventType:"labs.enquiry_received",status:"PENDING"},orderBy:{createdAt:"asc"},take:25 }).then(rows=>rows.map(r=>({id:r.id,createdAt:r.createdAt,data:leadInput.parse(JSON.parse(r.metadata??"{}"))}))); }
  async function projectList(userId: string) { const a=await access(client,userId), scope={organizationId:a.divisionId};const manage=(await a.ctx.decide("labs.delivery.manage",scope)).allowed;const rows=await client.project.findMany({where:{organizationId:a.divisionId,executiveRecords:{some:{organizationId:a.divisionId,kind:"LABS_LEAD",status:"WON"}},...(!manage?{OR:[{ownerPersonId:a.ctx.user!.personId!},{accountablePersonId:a.ctx.user!.personId!}]}:{})},orderBy:[{updatedAt:"desc"},{id:"asc"}],take:50});const result=[];for(const p of rows)if(JSON.parse(p.metadata??"{}").kind==="AIRALABS_PROJECT"&&(await a.ctx.decide("project.read",{...scope,projectId:p.id})).allowed)result.push(p);return result; }
  async function people(userId:string){const a=await access(client,userId,"labs.sales.manage");await a.ctx.requireAccess("person.read",{organizationId:a.divisionId});const users=await client.user.findMany({where:{status:"ACTIVE",person:{is:{status:"ACTIVE",memberships:{some:{organizationId:a.divisionId,status:"ACTIVE"}}}}},select:{id:true,email:true,person:{select:{displayName:true}}},take:50,orderBy:{email:"asc"}});const result=[];for(const user of users){try{const p=await access(client,user.id);result.push({id:user.id,email:user.email,name:user.person!.displayName,advisor:(await p.ctx.decide("labs.sales.self",{organizationId:a.divisionId})).allowed&&(await p.ctx.decide("notification.read",{organizationId:a.divisionId})).allowed,developer:(await p.ctx.decide("labs.delivery.assignee",{organizationId:a.divisionId})).allowed});}catch(error){if(!(error instanceof AccessError))throw error;}}return result;}
  async function detail(userId:string,id:string){const {row}=await owned(client,userId,id,"LABS_LEAD");return {...row,data:leadPayload.parse(JSON.parse(row.payload))};}
  async function projectWork(userId:string,projectId:string,db:DB=client,key="task.read") {const a=await access(db,userId),p=await db.project.findUnique({where:{id:projectId}});if(!p||p.organizationId!==a.divisionId||JSON.parse(p.metadata??"{}").kind!=="AIRALABS_PROJECT")throw new AccessError("Project unavailable");const scope={organizationId:a.divisionId,projectId};await a.ctx.requireAccess("project.read",scope);await a.ctx.requireAccess(key,scope);const manager=(await a.ctx.decide("labs.delivery.manage",{organizationId:a.divisionId})).allowed;if(!manager&&p.ownerPersonId!==a.ctx.user!.personId&&p.accountablePersonId!==a.ctx.user!.personId)throw new AccessError("Project unavailable");return {project:p,tasks:await db.task.findMany({where:{projectId,...(!manager?{assigneePersonId:a.ctx.user!.personId}: {})},take:50,orderBy:[{dueDate:"asc"},{id:"asc"}]}),canManage:!["COMPLETED","CANCELLED","ARCHIVED"].includes(p.status)&&(await a.ctx.decide("task.manage",scope)).allowed};}
  async function saveTask(userId:string,raw:unknown){const data=z.object({projectId:z.string(),taskId:z.string().optional(),title:z.string().trim().min(1).max(200),description:z.string().trim().max(4000),dueDate:z.string().datetime(),status:z.enum(["TODO","IN_PROGRESS","BLOCKED","COMPLETED","CANCELLED"]),reference:z.string().min(8).max(100)}).strict().parse(raw);return client.$transaction(async db=>{const {project,canManage}=await projectWork(userId,data.projectId,db,"task.manage");if(!canManage)throw new AccessError("Closed project is read-only");const a=await access(db,userId);const manager=(await a.ctx.decide("labs.delivery.manage",{organizationId:a.divisionId,projectId:project.id})).allowed;const prior=data.taskId?await db.task.findFirst({where:{id:data.taskId,projectId:data.projectId}}):null;if(data.taskId&&!prior)throw new AccessError("Task unavailable");if(!manager&&(prior&&prior.assigneePersonId!==a.ctx.user!.personId||["COMPLETED","CANCELLED"].includes(data.status)))throw new AccessError("Assigned open task required");const reference="labs:task:"+digest([data.projectId,userId,data.reference]),fingerprint=digest(data),old=await db.operationalEvent.findUnique({where:{reference}});if(old){if(JSON.parse(old.metadata??"{}").fingerprint!==fingerprint)throw new AccessError("Task replay mismatch");return;}const task=await execution.save(userId,"tasks",{organizationId:project.organizationId,projectId:project.id,title:data.title,description:data.description,dueDate:data.dueDate,status:data.status,assigneePersonId:prior?.assigneePersonId??project.ownerPersonId},data.taskId,db);await event(db,userId,{organizationId:project.organizationId,id:task.id},"labs.task_saved",reference,{fingerprint});});}
  async function processFollowups(userId:string){const a=await access(client,userId,"labs.sales.manage");await a.ctx.requireAccess("operations.process",{organizationId:a.divisionId});const scoped=createOperationsService(client,(id,db)=>createAccessContext(id,db,undefined,{organizationId:a.divisionId}));return scoped.processDue(userId,25,"LABS_FOLLOWUP");}
  async function reminders(userId:string){const a=await access(client,userId);const scope={organizationId:a.divisionId};await a.ctx.requireAccess("reminder.read",scope);const manager=(await a.ctx.decide("labs.sales.read",scope)).allowed;if(!manager)await a.ctx.requireAccess("labs.sales.self",scope);return {canProcess:manager&&(await a.ctx.decide("labs.sales.manage",scope)).allowed&&(await a.ctx.decide("operations.process",scope)).allowed,records:await client.reminder.findMany({where:{organizationId:a.divisionId,reference:{startsWith:"labs-followup:"},...(!manager?{recipientUserId:userId}:{})},select:{id:true,status:true,remindAt:true,completedAt:true},orderBy:{remindAt:"desc"},take:50})};}
  return { createLead, enquire, assignEnquiry, unassigned, assign, updateLead, quote, submitQuote, decideQuote, issue, accept, startProject, deliver, list, detail, projectList, people,projectWork,saveTask,processFollowups,reminders, quoteDocument: async (userId: string, id: string) => { const { row } = await owned(client, userId, id, "LABS_QUOTE"); return { row, data: quotePayload.parse(JSON.parse(row.payload)) }; } };
}
export const labsService = createLabsService();
export const skillCityLabsService = createLabsService(prisma, () => new Date(), "skillcity");
