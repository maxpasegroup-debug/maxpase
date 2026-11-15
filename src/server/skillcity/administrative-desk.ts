import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { parseStartupApplicationPayload } from "@/server/portals/startup-applications";

const contactUpdate = z.object({ customerId: z.string().min(1).max(200), version: z.number().int().min(0), reference: z.string().uuid(), contactPerson: z.string().trim().max(160), email: z.string().trim().email().max(254).or(z.literal("")), phone: z.string().trim().max(30), billingAddress: z.string().trim().min(5).max(1000), pinCode: z.string().trim().regex(/^[0-9]{6}$/), notes: z.string().trim().max(2000) }).strict();
const taskUpdate = z.object({ taskId: z.string().min(1).max(200), revision: z.number().int().min(0), status: z.enum(["IN_PROGRESS", "COMPLETED"]), note: z.string().trim().min(10).max(2000), reference: z.string().uuid() }).strict();
const startupTriage = z.object({ id: z.string().min(1).max(200), version: z.number().int().min(0), reason: z.string().trim().min(10).max(500), reference: z.string().uuid() }).strict();

export function createSkillCityAdministrativeDesk(client: PrismaClient = prisma) {
  async function startupBoundary(userId: string, permission: string) {
    const access = await requirePortalAccess(client, userId, "skillcity");
    const { ctx, companyId } = access;
    const company = await client.organization.findUnique({ where: { id: companyId }, select: { id: true, slug: true } });
    if (!company || company.slug !== "aira-skill-city" || !ctx.user?.personId || !ctx.grants.some(grant => grant.organizationId === company.id && grant.roleName === "Administrative Officer")) throw new AccessError("Administrative Officer appointment unavailable");
    const startup = await client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    if (!startup) throw new AccessError("Startup Skool application desk unavailable");
    await ctx.requireAccess("skillcity.administrative.read", { organizationId: company.id });
    await ctx.requireAccess(permission, { organizationId: startup.id });
    return { ctx, company, startup };
  }
  async function boundary(userId: string, permission: string) {
    const access = await requirePortalAccess(client, userId, "skillcity");
    const { ctx, companyId } = access;
    const company = await client.organization.findUnique({ where: { id: companyId }, select: { id: true, slug: true, name: true, company: { select: { legalName: true, status: true, displayName: true, country: true, region: true } } } });
    if (!company || company.slug !== "aira-skill-city" || !ctx.user?.personId || !ctx.grants.some(grant => grant.organizationId === companyId && grant.roleName === "Administrative Officer")) throw new AccessError("Administrative Officer appointment unavailable");
    const labs = await client.organization.findFirst({ where: { slug: "aira-labs", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true } });
    if (!labs) throw new AccessError("AIRA Labs scope unavailable");
    await ctx.requireAccess("organization.read", { organizationId: companyId });
    await ctx.requireAccess("company.read", { organizationId: companyId });
    await ctx.requireAccess("skillcity.administrative.read", { organizationId: companyId });
    await ctx.requireAccess(permission, { organizationId: labs.id });
    return { access, ctx, company, labs };
  }

  async function workspace(userId: string) {
    const { ctx, company, labs } = await boundary(userId, "labs.billing.status.read");
    const can = async (permission: string) => (await ctx.decide(permission, { organizationId: labs.id })).allowed;
    const [canTasks, canCustomers, canCommercial, canEvents, canReviewDocs] = await Promise.all([
      ctx.decide("task.read", { organizationId: company.id }).then(row => row.allowed),
      can("labs.billing.customer.read"), can("labs.billing.status.read"),
      ctx.decide("event.read", { organizationId: company.id }).then(row => row.allowed), can("labs.billing.status.read"),
    ]);
    const labsCompany = await client.organization.findUnique({ where: { id: labs.id }, select: { name: true } });
    const divisions = await client.organization.findMany({ where: { parentId: company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } });
    const orgIds = [company.id, labs.id];
    const tasks = canTasks ? await client.task.findMany({ where: { organizationId: { in: orgIds }, assigneePersonId: ctx.user!.personId!, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, revision: true, title: true, status: true, dueDate: true, priority: true, organization: { select: { name: true } } }, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], take: 20 }) : [];
    const customers = canCustomers ? await client.labsBillingCustomer.findMany({ where: { companyId: company.id, active: true }, select: { id: true, version: true, legalName: true, businessName: true, contactPerson: true, email: true, phone: true, billingAddress: true, pinCode: true, notes: true }, orderBy: [{ legalName: "asc" }, { id: "asc" }], take: 50 }) : [];
    let quotations: { id: string; title: string; status: string; updatedAt: Date; dueAt: Date | null; converted: boolean }[] = [], invoices: { id: string; invoiceNumber: string; customerName: string; status: string; deliveryStatus: string; issueDate: Date; totalAmount: string }[] = [];
    if (canCommercial) {
      const [quotes, invoiceRows] = await Promise.all([
        client.executiveRecord.findMany({ where: { organizationId: labs.id, kind: "LABS_QUOTE" }, select: { id: true, title: true, status: true, updatedAt: true, dueAt: true }, orderBy: { updatedAt: "desc" }, take: 25 }),
        client.labsBillingInvoice.findMany({ where: { companyId: company.id }, select: { id: true, quoteId: true, invoiceNumber: true, customerSnapshot: true, status: true, deliveryStatus: true, issueDate: true, totalAmount: true }, orderBy: { issueDate: "desc" }, take: 25 }),
      ]);
      const converted = new Set(invoiceRows.map(row => row.quoteId));
      quotations = quotes.map(row => ({ id: row.id, title: row.title, status: row.status, updatedAt: row.updatedAt, dueAt: row.dueAt, converted: converted.has(row.id) }));
      invoices = invoiceRows.map(row => { let customerName = "Customer record"; try { const snapshot = JSON.parse(row.customerSnapshot) as { legalName?: string }; customerName = snapshot.legalName || customerName; } catch { /* Keep the safe fallback label. */ } return { id: row.id, invoiceNumber: row.invoiceNumber, customerName, status: row.status, deliveryStatus: row.deliveryStatus, issueDate: row.issueDate, totalAmount: row.totalAmount }; });
    }
    const [pendingCompanyEvidence, pendingCompanyProfile, recentActivity] = await Promise.all([
      canReviewDocs ? client.labsBillingEvidence.count({ where: { companyId: company.id, profileId: { not: null }, verifiedAt: null } }) : 0,
      canReviewDocs ? client.labsBillingProfile.findUnique({ where: { companyId: company.id }, select: { profileStatus: true } }) : null,
      canEvents ? client.operationalEvent.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true, eventType: true, entityType: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 12 }) : [],
    ]);
    const startup = await client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: company.id, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    const startupRead = startup ? await ctx.decide("startup.application.read", { organizationId: startup.id }) : { allowed: false };
    const startupTriageAllowed = startup ? await ctx.decide("startup.application.triage", { organizationId: startup.id }) : { allowed: false };
    const startupApplications = startupRead.allowed && startup ? (await client.executiveRecord.findMany({ where: { organizationId: startup.id, kind: "STARTUP_APPLICATION", status: { in: ["SUBMITTED", "IN_REVIEW"] }, sourceKey: { startsWith: "startup:application:" } }, select: { id: true, status: true, version: true, payload: true, createdAt: true, owner: { select: { displayName: true } } }, orderBy: { createdAt: "asc" }, take: 25 })).map(row => ({ id: row.id, status: row.status, version: row.version, createdAt: row.createdAt, applicant: row.owner.displayName, tier: parseStartupApplicationPayload(row.payload).tier })) : [];
    return { company: { name: company.company?.legalName ?? company.name, status: company.company?.status ?? "NOT_RECORDED", region: company.company?.region ?? null }, labsName: labsCompany?.name ?? "AIRA Labs", divisions, tasks, customers, quotations, invoices, startupApplications, documents: { profileStatus: pendingCompanyProfile?.profileStatus ?? "NOT_CONFIGURED", awaitingIndependentReview: pendingCompanyEvidence }, recentActivity, permissions: { canTasks, canUpdateTasks: (await ctx.decide("skillcity.administrative.task.perform", { organizationId: company.id })).allowed, canCustomers, canCommercial, canEvents, canReviewDocs, canEditCustomers: (await can("labs.billing.customer.manage")), canStartupTriage: startupTriageAllowed.allowed } };
  }

  async function triageStartupApplication(userId: string, raw: unknown) {
    const input = startupTriage.parse(raw);
    const { ctx, startup } = await startupBoundary(userId, "startup.application.triage");
    await ctx.requireAccess("startup.application.read", { organizationId: startup.id });
    return client.$transaction(async db => {
      const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
      const row = await db.executiveRecord.findFirst({ where: { id: input.id, organizationId: startup.id, kind: "STARTUP_APPLICATION", status: "SUBMITTED", sourceKey: { startsWith: "startup:application:" } }, select: { id: true, ownerPersonId: true, status: true, version: true } });
      if (!actor?.personId || !row || row.version !== input.version || row.ownerPersonId === actor.personId) throw new AccessError("Application changed or unavailable");
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: startup.id, kind: "STARTUP_APPLICATION", status: "SUBMITTED", version: input.version }, data: { status: "IN_REVIEW", version: { increment: 1 } } })).count !== 1) throw new AccessError("Application changed; refresh before triage");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "SUBMITTED", toStatus: "IN_REVIEW", reason: input.reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId: startup.id, action: "startup.application.ao_triaged", entityType: "ExecutiveRecord", entityId: row.id, reference: `startup-ao-triage:${input.reference}`, result: "SUCCESS", metadata: { previousStatus: "SUBMITTED", nextStatus: "IN_REVIEW", version: input.version + 1 } });
      return { id: row.id, status: "IN_REVIEW" };
    });
  }

  async function updateOwnTask(userId: string, raw: unknown) {
    const input = taskUpdate.parse(raw);
    const { ctx, company, labs } = await boundary(userId, "skillcity.administrative.task.perform");
    return client.$transaction(async db => {
      const task = await db.task.findFirst({ where: { id: input.taskId, organizationId: { in: [company.id, labs.id] }, assigneePersonId: ctx.user!.personId!, status: { notIn: ["COMPLETED", "CANCELLED"] } } });
      if (!task || task.revision !== input.revision || input.status === "IN_PROGRESS" && task.status === "IN_PROGRESS") throw new AccessError("Only an open task assigned to you can be updated");
      let metadata: Record<string, unknown> = {};
      try { const parsed = JSON.parse(task.metadata ?? "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed; } catch { throw new AccessError("Task metadata is invalid; ask a project owner to review it"); }
      const changed = await db.task.updateMany({ where: { id: task.id, revision: task.revision, assigneePersonId: ctx.user!.personId!, status: task.status }, data: { status: input.status, completionDate: input.status === "COMPLETED" ? new Date() : null, revision: { increment: 1 }, metadata: JSON.stringify({ ...metadata, administrativeUpdate: { byUserId: userId, note: input.note, reference: input.reference, updatedAt: new Date().toISOString() } }) } });
      if (changed.count !== 1) throw new AccessError("Task changed; refresh before updating");
      const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: task.organizationId, projectId: task.projectId, action: "skillcity.administrative_task_updated", entityType: "Task", entityId: task.id, reference: `skillcity-ao-task:${input.reference}`, result: "SUCCESS", metadata: { previousStatus: task.status, nextStatus: updated.status, revision: updated.revision, noteLength: input.note.length } });
      return updated;
    });
  }

  async function updateCustomerContact(userId: string, raw: unknown) {
    const input = contactUpdate.parse(raw);
    const { ctx, company, labs } = await boundary(userId, "labs.billing.customer.manage");
    return client.$transaction(async db => {
      const customer = await db.labsBillingCustomer.findFirst({ where: { id: input.customerId, companyId: company.id, active: true } });
      if (!customer || customer.version !== input.version) throw new AccessError("Customer record changed or is unavailable; refresh the dashboard");
      const updatedCount = await db.labsBillingCustomer.updateMany({ where: { id: customer.id, companyId: company.id, version: input.version }, data: { contactPerson: input.contactPerson || null, email: input.email || null, phone: input.phone || null, billingAddress: input.billingAddress, pinCode: input.pinCode, notes: input.notes || null, version: { increment: 1 } } });
      if (updatedCount.count !== 1) throw new AccessError("Customer record changed; refresh before saving");
      const updated = await db.labsBillingCustomer.findUniqueOrThrow({ where: { id: customer.id } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: labs.id, action: "labs.billing_customer_contact_updated_by_ao", entityType: "LabsBillingCustomer", entityId: customer.id, reference: `skillcity-ao-customer:${input.reference}`, result: "SUCCESS", metadata: { fields: ["contactPerson", "email", "phone", "billingAddress", "pinCode", "notes"], previousVersion: customer.version, nextVersion: updated.version } });
      return updated;
    });
  }

  return { workspace, updateCustomerContact, updateOwnTask, triageStartupApplication };
}

export const skillCityAdministrativeDesk = createSkillCityAdministrativeDesk();
