import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { createBossService } from "./boss-service";
import { operationalEvent } from "@/server/domain/operational-events";
import { buildHrLetterPdf } from "./hr-letter-pdf";
import { hrDocuments } from "./hr-documents";

const id = z.string().min(1).max(200);
const reference = z.string().trim().min(8).max(200);
const kinds = ["OFFER", "APPOINTMENT", "PROBATION_CONFIRMATION", "SALARY_CHANGE", "INCENTIVE"] as const;
const stages = ["NEW", "SCREENING", "INTERVIEW", "OFFER", "OFFER_DECLINED", "REJECTED", "WITHDRAWN"] as const;
const placeholders = new Set(["candidate_name", "employee_name", "role_title", "company_name", "brand_name", "start_date", "effective_date", "employment_type", "salary", "incentive", "terms", "acceptance_url", "signatory_name", "signatory_title"]);
const templateInput = z.object({ id: id.optional(), companyId: id, brandId: z.union([id, z.literal("")]).transform(v => v || null), kind: z.enum(kinds), name: z.string().trim().min(2).max(120), subject: z.string().trim().min(2).max(180), body: z.string().trim().min(20).max(12000) }).strict();
const candidateInput = z.object({ companyId: id, brandId: z.union([id, z.literal("")]).transform(v => v || null), fullName: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), phone: z.string().trim().max(30).transform(v => v || null), roleTitle: z.string().trim().min(2).max(160), source: z.string().trim().max(100).transform(v => v || null), notes: z.string().trim().max(3000).transform(v => v || null) }).strict();
const letterInput = z.object({ companyId: id, candidateId: id.optional(), employmentId: id.optional(), templateId: id, brandId: z.union([id, z.literal("")]).transform(v => v || null), startDate: z.string().trim().max(30).default(""), effectiveDate: z.string().trim().max(30).default(""), employmentType: z.string().trim().max(80).default(""), salary: z.string().trim().max(200).default(""), incentive: z.string().trim().max(200).default(""), terms: z.string().trim().max(4000).default(""), decisionReference: z.string().trim().max(200).default("") }).strict().refine(v => !!v.candidateId !== !!v.employmentId, "Choose either a candidate or an employee").refine(v => [v.startDate, v.effectiveDate].every(date => !date || /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime())), "Enter dates using the calendar fields");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
function renderTemplate(value: string, variables: Record<string, string>, preview = false) {
  const unknown = [...value.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1]).filter(key => !placeholders.has(key));
  if (unknown.length) throw new AccessError(`Template contains unsupported fields: ${[...new Set(unknown)].join(", ")}`);
  return value.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => key === "acceptance_url" && preview ? "[Secure acceptance link is included when this offer is sent]" : variables[key] ?? "");
}
function senderFor(companySlug: string) {
  const key = companySlug.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const sender = process.env[`MAXPASE_HR_FROM_${key}`];
  const verified = process.env[`MAXPASE_VERIFIED_HR_FROM_${key}`];
  const apiKey = process.env.RESEND_API_KEY;
  const origin = process.env.APP_ORIGIN;
  if (!apiKey || apiKey.length < 10 || !sender || sender !== verified || !z.email().safeParse(sender).success || !origin) return null;
  try { const url = new URL(origin); if (!["https:", "http:"].includes(url.protocol) || url.search || url.hash) return null; }
  catch { return null; }
  return { apiKey, sender, origin: origin.replace(/\/$/, "") };
}
const defaultTemplates = [
  { kind: "OFFER", name: "Offer letter starter", subject: "Offer of employment — {{role_title}}", body: "Dear {{candidate_name}},\n\nWe are pleased to offer you the position of {{role_title}} with {{company_name}} at {{brand_name}}.\n\nEmployment type: {{employment_type}}\nProposed joining date: {{start_date}}\nCompensation: {{salary}}\nIncentive: {{incentive}}\nAdditional terms: {{terms}}\n\nPlease review the attached offer and accept or decline using the secure link below.\n{{acceptance_url}}\n\nFor {{company_name}},\n{{signatory_name}}\n{{signatory_title}}" },
  { kind: "APPOINTMENT", name: "Appointment letter starter", subject: "Appointment letter — {{role_title}}", body: "Dear {{employee_name}},\n\nThis letter records your appointment as {{role_title}} with {{company_name}} at {{brand_name}}.\n\nEmployment type: {{employment_type}}\nJoining date: {{start_date}}\nCompensation: {{salary}}\nTerms: {{terms}}\n\nFor {{company_name}},\n{{signatory_name}}\n{{signatory_title}}" },
  { kind: "PROBATION_CONFIRMATION", name: "Probation confirmation starter", subject: "Employment confirmation — {{employee_name}}", body: "Dear {{employee_name}},\n\nWe are recording confirmation of your employment as {{role_title}} with {{company_name}} at {{brand_name}}, effective {{effective_date}}.\n\nUpdated compensation: {{salary}}\nTerms: {{terms}}\n\nFor {{company_name}},\n{{signatory_name}}\n{{signatory_title}}" },
  { kind: "SALARY_CHANGE", name: "Salary change starter", subject: "Compensation update — {{employee_name}}", body: "Dear {{employee_name}},\n\nThis letter records a compensation change for your role as {{role_title}} with {{company_name}} at {{brand_name}}, effective {{effective_date}}.\n\nNew compensation: {{salary}}\nTerms: {{terms}}\n\nFor {{company_name}},\n{{signatory_name}}\n{{signatory_title}}" },
  { kind: "INCENTIVE", name: "Incentive letter starter", subject: "Incentive terms — {{employee_name}}", body: "Dear {{employee_name}},\n\nThis letter records incentive terms for your role as {{role_title}} with {{company_name}} at {{brand_name}}, effective {{effective_date}}.\n\nIncentive: {{incentive}}\nTerms: {{terms}}\n\nFor {{company_name}},\n{{signatory_name}}\n{{signatory_title}}" },
] as const;

export function createHrRecruitmentService(client: PrismaClient = prisma, transport: typeof fetch = fetch, now: () => Date = () => new Date()) {
  const boss = createBossService(client);
  async function scope(db: Prisma.TransactionClient | PrismaClient, userId: string, companyId: string, permission: string) {
    const { ctx, root } = await boss.authority(userId, db as Prisma.TransactionClient);
    const company = await db.organization.findFirst({ where: { id: companyId, parentId: root.id, type: "COMPANY", status: "ACTIVE" }, select: { id: true, name: true, slug: true } });
    if (!company) throw new AccessError("Company unavailable");
    await ctx.requireAccess(permission, { organizationId: companyId });
    return { ctx, company };
  }
  async function list(userId: string, companyId: string) {
    await scope(client, userId, companyId, "person.read");
    const [candidates, templates, letters] = await Promise.all([
      client.hrCandidate.findMany({ where: { companyId }, include: { brand: { select: { id: true, name: true } }, letters: { where: { kind: "OFFER" }, select: { id: true, status: true, sentAt: true, acceptedAt: true }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 300 }),
      client.hrLetterTemplate.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { kind: "asc" }, { name: "asc" }], take: 100 }),
      client.hrLetter.findMany({ where: { companyId }, include: { candidate: { select: { fullName: true } }, employment: { include: { person: { select: { displayName: true } } } }, brand: { select: { name: true } }, storedDocument: { select: { id: true } }, deliveryEvents: { orderBy: { occurredAt: "desc" }, take: 5, select: { providerEventId: true, eventType: true, occurredAt: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    return { candidates, templates, letters, mailReady: !!senderFor((await scope(client, userId, companyId, "person.read")).company.slug), webhookReady: !!process.env.MAXPASE_HR_RESEND_WEBHOOK_SECRET?.startsWith("whsec_"), documentStorageReady: hrDocuments.configured() };
  }
  async function createCandidate(userId: string, raw: unknown) {
    const input = candidateInput.parse(raw);
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.create");
      if (input.brandId && !await db.brand.findFirst({ where: { id: input.brandId, organizationId: input.companyId, status: "ACTIVE" }, select: { id: true } })) throw new AccessError("Brand is not active in this company");
      const row = await db.hrCandidate.create({ data: { ...input, status: "NEW" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.candidate_created", entityType: "HrCandidate", entityId: row.id, result: "SUCCESS", metadata: { roleTitle: input.roleTitle, source: input.source } });
      return row.id;
    });
  }
  async function moveCandidate(userId: string, candidateId: string, rawStatus: unknown) {
    const status = z.enum(stages).parse(rawStatus);
    return client.$transaction(async db => {
      const row = await db.hrCandidate.findUnique({ where: { id: candidateId } });
      if (!row || ["OFFER_ACCEPTED", "OFFER_DECLINED", "HIRED"].includes(row.status)) throw new AccessError("Candidate stage cannot be changed here");
      if (row.status === "OFFER" && status !== "OFFER" && await db.hrLetter.findFirst({ where: { candidateId, kind: "OFFER", status: "SENT", deliveryStatus: { in: ["SENT", "DELIVERED"] }, tokenExpiresAt: { gt: now() } } })) throw new AccessError("Resolve or void the open offer before changing candidate stage");
      const { ctx } = await scope(db, userId, row.companyId, "person.update");
      await db.hrCandidate.update({ where: { id: row.id }, data: { status } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "hr.candidate_stage_changed", entityType: "HrCandidate", entityId: row.id, result: "SUCCESS", metadata: { from: row.status, to: status } });
    });
  }
  async function saveTemplate(userId: string, raw: unknown) {
    const input = templateInput.parse(raw);
    renderTemplate(input.body, {}, true); renderTemplate(input.subject, {}, true);
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, input.companyId, "person.update");
      if (input.brandId && !await db.brand.findFirst({ where: { id: input.brandId, organizationId: input.companyId }, select: { id: true } })) throw new AccessError("Brand is not in this company");
      if (input.id) {
        const existing = await db.hrLetterTemplate.findFirst({ where: { id: input.id, companyId: input.companyId } });
        if (!existing) throw new AccessError("Template unavailable");
      }
      const row = input.id
        ? await db.hrLetterTemplate.update({ where: { id: input.id }, data: { brandId: input.brandId, kind: input.kind, name: input.name, subject: input.subject, body: input.body, active: true, updatedByUserId: userId } })
        : await db.hrLetterTemplate.create({ data: { ...input, updatedByUserId: userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: input.id ? "hr.letter_template_updated" : "hr.letter_template_created", entityType: "HrLetterTemplate", entityId: row.id, result: "SUCCESS", metadata: { kind: row.kind, name: row.name } });
      return row.id;
    });
  }
  async function createStarterTemplates(userId: string, companyId: string) {
    return client.$transaction(async db => {
      const { ctx } = await scope(db, userId, companyId, "person.update");
      const existing = await db.hrLetterTemplate.findMany({ where: { companyId, active: true }, select: { kind: true } });
      const missing = defaultTemplates.filter(template => !existing.some(row => row.kind === template.kind));
      for (const template of missing) await db.hrLetterTemplate.create({ data: { ...template, companyId, subject: template.subject, updatedByUserId: userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: companyId, action: "hr.letter_starter_templates_created", entityType: "HrLetterTemplate", entityId: companyId, result: "SUCCESS", metadata: { count: missing.length } });
      return missing.length;
    });
  }
  async function createLetter(userId: string, raw: unknown) {
    const input = letterInput.parse(raw);
    return client.$transaction(async db => {
      const { ctx, company } = await scope(db, userId, input.companyId, "person.update");
      const template = await db.hrLetterTemplate.findFirst({ where: { id: input.templateId, companyId: input.companyId, active: true } });
      if (!template) throw new AccessError("Active HR template unavailable");
      let recipientName: string, recipientEmail: string, roleTitle: string, brandId: string | null = input.brandId, brandName = "", candidateId: string | null = null, employmentId: string | null = null;
      let employeeType = input.employmentType;
      if (input.candidateId) {
        const candidate = await db.hrCandidate.findFirst({ where: { id: input.candidateId, companyId: input.companyId } });
        if (!candidate || template.kind !== "OFFER" || !["NEW", "SCREENING", "INTERVIEW", "OFFER"].includes(candidate.status)) throw new AccessError("Candidate is unavailable for an offer");
        recipientName = candidate.fullName; recipientEmail = candidate.email; roleTitle = candidate.roleTitle; candidateId = candidate.id; brandId = input.brandId ?? candidate.brandId;
      } else {
        const employment = await db.employment.findFirst({ where: { id: input.employmentId, companyId: input.companyId, status: { not: "ENDED" } }, include: { person: { select: { displayName: true, email: true } }, assignments: { select: { brandId: true, status: true } } } });
        if (!employment || template.kind === "OFFER" || !employment.person.email) throw new AccessError("Active employee record and email are required for this letter");
        recipientName = employment.person.displayName; recipientEmail = employment.person.email; roleTitle = employment.designation ?? "Employee"; employmentId = employment.id; brandId = input.brandId ?? employment.assignments.find(a => a.status === "ACTIVE")?.brandId ?? null; employeeType = input.employmentType || employment.employmentType || "";
      }
      if (brandId) {
        const brand = await db.brand.findFirst({ where: { id: brandId, organizationId: input.companyId }, select: { id: true, name: true } });
        if (!brand || template.brandId && template.brandId !== brandId) throw new AccessError("Brand or template scope mismatch");
        brandName = brand.name;
      }
      const data: Record<string, string> = { candidate_name: candidateId ? recipientName : "", employee_name: employmentId ? recipientName : "", role_title: roleTitle, company_name: company.name, brand_name: brandName || "Company-wide", start_date: input.startDate, effective_date: input.effectiveDate, employment_type: employeeType, salary: input.salary, incentive: input.incentive, terms: input.terms, acceptance_url: "[[OFFER_ACCEPTANCE_LINK]]", signatory_name: "", signatory_title: "" };
      const bodySnapshot = renderTemplate(template.body, data), subject = renderTemplate(template.subject, data);
      const row = await db.hrLetter.create({ data: { companyId: input.companyId, brandId, candidateId, employmentId, templateId: template.id, kind: template.kind, status: "DRAFT", title: template.name, recipientName, recipientEmail, subject, bodySnapshot, dataSnapshot: JSON.stringify(data), decisionReference: input.decisionReference || null, createdByUserId: userId } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.letter_drafted", entityType: "HrLetter", entityId: row.id, result: "SUCCESS", metadata: { kind: row.kind, candidateId, employmentId, brandId } });
      return row.id;
    });
  }
  async function storeLetterDocument(userId: string, letterId: string) {
    const row = await client.hrLetter.findUnique({ where: { id: letterId }, include: { company: { select: { name: true } }, brand: { select: { name: true } } } });
    if (!row || !row.providerReference) throw new AccessError("Issued letter unavailable for employee document storage");
    if (row.storedDocumentId) return true;
    if (!row.employmentId) {
      if (row.candidateId) await client.hrLetter.updateMany({ where: { id: row.id, storedDocumentId: null }, data: { documentStorageStatus: "WAITING_EMPLOYMENT" } });
      return false;
    }
    const claimed = await client.hrLetter.updateMany({ where: { id: row.id, storedDocumentId: null, OR: [{ documentStorageStatus: { in: ["PENDING", "FAILED"] } }, { documentStorageStatus: "ARCHIVING", documentStorageStartedAt: { lt: new Date(now().getTime() - 5 * 60 * 1000) } }] }, data: { documentStorageStatus: "ARCHIVING", documentStorageStartedAt: now() } });
    if (claimed.count !== 1) return !!(await client.hrLetter.findUnique({ where: { id: row.id }, select: { storedDocumentId: true } }))?.storedDocumentId;
    try {
      const body = row.bodySnapshot.replaceAll("[[OFFER_ACCEPTANCE_LINK]]", "[Secure acceptance link sent separately by email]");
      const bytes = buildHrLetterPdf({ companyName: row.company.name, brandName: row.brand?.name, kind: row.kind, title: row.title, recipientName: row.recipientName, subject: row.subject, body });
      const fileName = `${row.kind.toLowerCase().replaceAll("_", "-")}-${row.id}.pdf`;
      const categoryKey = row.kind === "OFFER" ? "AGREEMENT" : "APPOINTMENT";
      const documentId = await hrDocuments.upload(userId, { employmentId: row.employmentId, categoryKey, title: `${row.title} - ${row.recipientName}`.slice(0, 160), filename: fileName }, bytes);
      await client.hrLetter.update({ where: { id: row.id }, data: { storedDocumentId: documentId, documentStorageStatus: "STORED", documentStorageStartedAt: null } });
      return true;
    } catch {
      await client.hrLetter.updateMany({ where: { id: row.id, storedDocumentId: null, documentStorageStatus: "ARCHIVING" }, data: { documentStorageStatus: "FAILED", documentStorageStartedAt: null } });
      return false;
    }
  }
  async function sendLetter(userId: string, letterId: string, decisionReferenceRaw: unknown) {
    const decisionReference = reference.parse(decisionReferenceRaw);
    const token = randomBytes(32).toString("base64url"), tokenHash = hashToken(token);
    const claimed = await client.$transaction(async db => {
      const row = await db.hrLetter.findUnique({ where: { id: letterId }, include: { company: { select: { name: true, slug: true } }, brand: { select: { name: true } } } });
      if (!row || !(row.status === "DRAFT" || row.status === "FAILED" && !row.providerReference) || row.deliveryAttempts >= 5) throw new AccessError("Letter is not ready to send or has reached the retry limit");
      const { ctx } = await scope(db, userId, row.companyId, "person.update");
      const sender = senderFor(row.company.slug);
      if (!sender) throw new AccessError("Verified Resend sender, API key and app origin must be configured for this company");
      const attempt = row.deliveryAttempts + 1;
      const url = `${sender.origin}/hr/offer/${encodeURIComponent(row.id)}?token=${encodeURIComponent(token)}`;
      const updated = await db.hrLetter.update({ where: { id: row.id, status: row.status }, data: { status: "SENDING", deliveryStatus: "SENDING", decisionReference, acceptanceTokenHash: row.kind === "OFFER" ? tokenHash : null, tokenExpiresAt: row.kind === "OFFER" ? new Date(now().getTime() + 14 * 86400000) : null, deliveryAttempts: attempt, lastDeliveryError: null } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "hr.letter_send_started", entityType: "HrLetter", entityId: row.id, result: "SUCCESS", metadata: { kind: row.kind, attempt, decisionReference } });
      return { row: updated, company: row.company, brand: row.brand, sender, url, attempt, actorPersonId: ctx.user!.personId };
    });
    const safeBody = claimed.row.bodySnapshot.replaceAll("[[OFFER_ACCEPTANCE_LINK]]", "[Secure acceptance link sent separately by email]");
    const emailBody = claimed.row.bodySnapshot.replaceAll("[[OFFER_ACCEPTANCE_LINK]]", claimed.url);
    const pdf = buildHrLetterPdf({ companyName: claimed.company.name, brandName: claimed.brand?.name, kind: claimed.row.kind, title: claimed.row.title, recipientName: claimed.row.recipientName, subject: claimed.row.subject, body: safeBody });
    let result: { status: "SENT" | "FAILED" | "DELIVERY_UNKNOWN"; providerReference?: string; error?: string };
    try {
      const response = await transport("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${claimed.sender.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `hr-letter/${claimed.row.id}/attempt/${claimed.attempt}` }, body: JSON.stringify({ from: claimed.sender.sender, to: [claimed.row.recipientEmail], subject: claimed.row.subject, text: `${emailBody}${claimed.row.kind === "OFFER" && !emailBody.includes(claimed.url) ? `\n\nAccept or decline securely: ${claimed.url}` : ""}`, attachments: [{ filename: `${claimed.row.kind.toLowerCase().replaceAll("_", "-")}-${claimed.row.id}.pdf`, content: pdf.toString("base64"), content_type: "application/pdf" }] }) });
      if (!response.ok) result = { status: "FAILED", error: `Resend rejected the request (${response.status})` };
      else {
        const body: unknown = await response.json();
        const providerId = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : null;
        result = providerId ? { status: "SENT", providerReference: providerId } : { status: "DELIVERY_UNKNOWN", error: "Resend response could not be verified" };
      }
    } catch { result = { status: "DELIVERY_UNKNOWN", error: "Delivery result is uncertain; check Resend before retrying" }; }
    const final = await client.$transaction(async db => {
      const row = await db.hrLetter.findUniqueOrThrow({ where: { id: claimed.row.id } });
      if (row.status !== "SENDING" || row.deliveryAttempts !== claimed.attempt) throw new AccessError("Letter status changed during delivery");
      await db.hrLetter.update({ where: { id: row.id }, data: { status: result.status, deliveryStatus: result.status === "SENT" ? "SENT" : result.status === "FAILED" ? "FAILED" : "UNKNOWN", documentStorageStatus: result.status === "SENT" ? row.employmentId ? "PENDING" : row.candidateId ? "WAITING_EMPLOYMENT" : "NOT_APPLICABLE" : row.documentStorageStatus, providerReference: result.providerReference, sentAt: result.status === "SENT" ? now() : null, lastDeliveryError: result.error ?? null } });
      if (result.status === "SENT" && row.candidateId && row.kind === "OFFER") await db.hrCandidate.update({ where: { id: row.candidateId }, data: { status: "OFFER" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: claimed.actorPersonId, organizationId: row.companyId, action: `hr.letter_${result.status.toLowerCase()}`, entityType: "HrLetter", entityId: row.id, result: result.status === "SENT" ? "SUCCESS" : "FAILURE", metadata: { kind: row.kind, providerReference: result.providerReference ?? null, error: result.error ?? null } });
      return { status: result.status };
    });
    const documentStored = final.status === "SENT" && claimed.row.employmentId ? await storeLetterDocument(userId, claimed.row.id) : null;
    return { ...final, documentStored };
  }
  async function getPdf(userId: string, letterId: string) {
    const row = await client.hrLetter.findUnique({ where: { id: letterId }, include: { company: { select: { name: true } }, brand: { select: { name: true } } } });
    if (!row) throw new AccessError("Letter unavailable");
    await scope(client, userId, row.companyId, "person.read");
    const body = row.bodySnapshot.replaceAll("[[OFFER_ACCEPTANCE_LINK]]", "[Secure acceptance link is included in the email]");
    return { bytes: buildHrLetterPdf({ companyName: row.company.name, brandName: row.brand?.name, kind: row.kind, title: row.title, recipientName: row.recipientName, subject: row.subject, body }), filename: `${row.kind.toLowerCase()}-${row.id}.pdf` };
  }
  async function archiveIssuedLetter(userId: string, letterId: string) {
    const row = await client.hrLetter.findUnique({ where: { id: letterId }, select: { companyId: true } });
    if (!row) throw new AccessError("Letter unavailable");
    await scope(client, userId, row.companyId, "person.update");
    return storeLetterDocument(userId, letterId);
  }
  async function processResendDeliveryEvent(providerEventId: string, rawPayload: string) {
    const eventSchema = z.object({ type: z.string().min(1).max(100), created_at: z.string().optional(), data: z.object({ email_id: z.string().min(1).max(200), created_at: z.string().optional() }).passthrough() }).passthrough();
    const parsed = eventSchema.safeParse(JSON.parse(rawPayload));
    if (!parsed.success) throw new AccessError("Resend event payload is invalid");
    const event = parsed.data;
    const recognized = ["email.sent", "email.delivered", "email.bounced", "email.failed", "email.delivery_delayed"] as const;
    if (!recognized.includes(event.type as typeof recognized[number])) return { matched: false, ignored: true };
    const timestamp = event.created_at ?? event.data.created_at;
    const occurredAt = timestamp ? new Date(timestamp) : now();
    if (Number.isNaN(occurredAt.getTime())) throw new AccessError("Resend event timestamp is invalid");
    const mapped = event.type === "email.delivered" ? "DELIVERED" : event.type === "email.bounced" ? "BOUNCED" : event.type === "email.failed" ? "FAILED" : event.type === "email.delivery_delayed" ? null : "SENT";
    try {
      return await client.$transaction(async db => {
        const letter = await db.hrLetter.findUnique({ where: { providerReference: event.data.email_id }, select: { id: true, companyId: true, lastDeliveryEventAt: true } });
        if (!letter) return { matched: false, ignored: true };
        await db.hrLetterDeliveryEvent.create({ data: { providerEventId, letterId: letter.id, eventType: event.type, occurredAt } });
        if (mapped && (!letter.lastDeliveryEventAt || occurredAt >= letter.lastDeliveryEventAt)) {
          await db.hrLetter.update({ where: { id: letter.id }, data: { deliveryStatus: mapped, lastDeliveryEventAt: occurredAt, lastDeliveryError: mapped === "BOUNCED" ? "Resend reported a bounced email" : mapped === "FAILED" ? "Resend reported an email delivery failure" : mapped === "DELIVERED" || mapped === "SENT" ? null : undefined } });
        }
        await operationalEvent(db, { organizationId: letter.companyId, action: "hr.email_delivery_event_received", entityType: "HrLetter", entityId: letter.id, result: "SUCCESS", metadata: { eventType: event.type, providerEventId } });
        return { matched: true, ignored: false };
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { matched: true, ignored: true };
      throw error;
    }
  }
  async function publicOffer(letterId: string, token: string) {
    const row = await client.hrLetter.findFirst({ where: { id: letterId, kind: "OFFER", status: { in: ["SENT", "ACCEPTED", "DECLINED"] }, deliveryStatus: { in: ["SENT", "DELIVERED"] }, tokenExpiresAt: { gt: now() } }, include: { company: { select: { name: true } }, brand: { select: { name: true } } } });
    if (!row?.acceptanceTokenHash) return null;
    const expected = Buffer.from(row.acceptanceTokenHash, "hex"), actual = Buffer.from(hashToken(token), "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return { id: row.id, status: row.status, companyName: row.company.name, brandName: row.brand?.name ?? null, title: row.title, recipientName: row.recipientName, subject: row.subject, body: row.bodySnapshot.replaceAll("[[OFFER_ACCEPTANCE_LINK]]", "[Secure acceptance link is included in the email]") };
  }
  async function publicOfferPdf(letterId: string, token: string) {
    const offer = await publicOffer(letterId, token);
    if (!offer) return null;
    return { bytes: buildHrLetterPdf({ companyName: offer.companyName, brandName: offer.brandName, kind: "OFFER", title: offer.title, recipientName: offer.recipientName, subject: offer.subject, body: offer.body }), filename: `offer-${offer.id}.pdf` };
  }
  async function decideOffer(letterId: string, token: string, decisionRaw: unknown) {
    const decision = z.enum(["ACCEPT", "DECLINE"]).parse(decisionRaw), hashed = hashToken(token);
    return client.$transaction(async db => {
      const row = await db.hrLetter.findFirst({ where: { id: letterId, kind: "OFFER", status: "SENT", deliveryStatus: { in: ["SENT", "DELIVERED"] }, acceptanceTokenHash: hashed, tokenExpiresAt: { gt: now() } } });
      if (!row || !row.candidateId) throw new AccessError("Offer is unavailable or expired");
      const status = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
      await db.hrLetter.update({ where: { id: row.id }, data: { status, acceptedAt: decision === "ACCEPT" ? now() : null, declinedAt: decision === "DECLINE" ? now() : null } });
      await db.hrCandidate.update({ where: { id: row.candidateId }, data: { status: decision === "ACCEPT" ? "OFFER_ACCEPTED" : "OFFER_DECLINED" } });
      await operationalEvent(db, { organizationId: row.companyId, action: `hr.offer_${decision.toLowerCase()}_by_candidate`, entityType: "HrLetter", entityId: row.id, result: "SUCCESS", metadata: { kind: "OFFER", candidateId: row.candidateId } });
      return status;
    });
  }
  async function convertAcceptedCandidate(userId: string, candidateId: string, rawReference: unknown) {
    const decisionReference = reference.parse(rawReference);
    const converted = await client.$transaction(async db => {
      const candidate = await db.hrCandidate.findUnique({ where: { id: candidateId }, include: { letters: { where: { kind: "OFFER", status: "ACCEPTED" }, orderBy: { acceptedAt: "desc" }, take: 1 } } });
      if (!candidate || candidate.status !== "OFFER_ACCEPTED" || candidate.convertedEmploymentId || !candidate.letters[0]) throw new AccessError("An accepted, unconverted offer is required");
      const { ctx } = await scope(db, userId, candidate.companyId, "person.create");
      const letter = candidate.letters[0], data = JSON.parse(letter.dataSnapshot) as Record<string, string>;
      const startDate = data.start_date ? new Date(data.start_date) : null;
      if (startDate && Number.isNaN(startDate.getTime())) throw new AccessError("Offer start date is invalid; correct the offer before conversion");
      let person = await db.person.findUnique({ where: { email: candidate.email }, select: { id: true, status: true } });
      if (person && person.status !== "ACTIVE") throw new AccessError("A disabled person already uses this email");
      if (!person) person = await db.person.create({ data: { displayName: candidate.fullName, email: candidate.email }, select: { id: true, status: true } });
      if (await db.employment.findFirst({ where: { companyId: candidate.companyId, personId: person.id, status: { not: "ENDED" } } })) throw new AccessError("This person already has open employment in the company");
      const brandId = candidate.brandId ?? letter.brandId;
      if (brandId) {
        await ctx.requireAccess("person.update", { organizationId: candidate.companyId });
        if (!await db.brand.findFirst({ where: { id: brandId, organizationId: candidate.companyId, status: "ACTIVE" }, select: { id: true } })) throw new AccessError("Offer brand is no longer active");
      }
      const employment = await db.employment.create({ data: { personId: person.id, companyId: candidate.companyId, designation: data.role_title || candidate.roleTitle, employmentType: data.employment_type || null, startDate, decisionReference } });
      if (brandId && startDate) await db.hrAssignment.create({ data: { employmentId: employment.id, brandId, designation: data.role_title || candidate.roleTitle, status: "DRAFT", startDate, decisionReference } });
      const linked = await db.hrCandidate.updateMany({ where: { id: candidate.id, status: "OFFER_ACCEPTED", convertedEmploymentId: null }, data: { status: "HIRED", convertedEmploymentId: employment.id } });
      if (linked.count !== 1) throw new AccessError("Candidate was converted in another request");
      await db.hrLetter.update({ where: { id: letter.id }, data: { employmentId: employment.id, documentStorageStatus: "PENDING" } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: candidate.companyId, action: "hr.candidate_converted_to_employment_draft", entityType: "Employment", entityId: employment.id, result: "SUCCESS", metadata: { candidateId: candidate.id, offerLetterId: letter.id, decisionReference } });
      return { employmentId: employment.id, letterId: letter.id };
    });
    const documentStored = await storeLetterDocument(userId, converted.letterId);
    return { employmentId: converted.employmentId, documentStored };
  }
  return { list, createCandidate, moveCandidate, saveTemplate, createStarterTemplates, createLetter, sendLetter, getPdf, archiveIssuedLetter, processResendDeliveryEvent, publicOffer, publicOfferPdf, decideOffer, convertAcceptedCandidate };
}

export const hrRecruitmentService = createHrRecruitmentService();
