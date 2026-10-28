import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { leadPayload, quotePayload } from "./input";

const grantInput = z.object({ leadId: z.string().min(1), customerEmail: z.string().trim().email().transform(value => value.toLowerCase()), evidence: z.string().trim().min(10).max(1000) }).strict();

export function createLabsCustomerService(client: PrismaClient = prisma) {
  async function operatorAccess(db: Prisma.TransactionClient, operatorId: string) {
    const employee = await requirePortalAccess(db, operatorId, "skillcity");
    const division = await db.organization.findUnique({ where: { slug: "aira-labs" }, select: { id: true, parentId: true, status: true } });
    if (!division || division.parentId !== employee.companyId || division.status !== "ACTIVE") throw new AccessError("Labs scope unavailable");
    const ctx = await createAccessContext(operatorId, db, undefined, { organizationId: division.id });
    await ctx.requireAccess("organization.read", { organizationId: division.id });
    await ctx.requireAccess("labs.customer.manage", { organizationId: division.id });
    return { divisionId: division.id, ctx };
  }
  async function isCustomer(userId: string) {
    const access = await requirePortalAccess(client, userId, "labs");
    const scope = { organizationId: access.divisionId };
    return (await access.ctx.decide("labs.customer.read", scope)).allowed && !(await access.ctx.decide("labs.sales.self", scope)).allowed && !(await access.ctx.decide("labs.sales.read", scope)).allowed && !(await access.ctx.decide("labs.delivery.manage", scope)).allowed;
  }

  async function grant(operatorId: string, raw: unknown) {
    const input = grantInput.parse(raw);
    return client.$transaction(async db => {
      const access = await operatorAccess(db, operatorId);
      const lead = await db.executiveRecord.findFirst({ where: { id: input.leadId, organizationId: access.divisionId, kind: "LABS_LEAD" } });
      const customer = await db.user.findUnique({ where: { email: input.customerEmail }, include: { person: true } });
      if (!lead || !customer || customer.status !== "ACTIVE" || customer.person?.status !== "ACTIVE" || !customer.emailVerifiedAt) throw new AccessError("Verified customer and enquiry required");
      const contact = leadPayload.parse(JSON.parse(lead.payload));
      const metadata = JSON.parse(customer.person?.metadata ?? "{}");
      if (contact.email !== customer.email.toLowerCase() || !contact.consent || metadata.authenticationRealm !== "labs" || metadata.credentialKind !== "LABS_PIN" || metadata.labsPinChangeRequired === true || await db.user.count({ where: { personId: customer.personId } }) !== 1) throw new AccessError("Dedicated verified Labs customer account required");
      const customerAccess = await requirePortalAccess(db, customer.id, "labs");
      await customerAccess.ctx.requireAccess("labs.customer.read", { organizationId: access.divisionId });
      const prior = await db.labsCustomerGrant.findUnique({ where: { leadId_customerUserId: { leadId: lead.id, customerUserId: customer.id } } });
      if (prior?.status === "ACTIVE") return prior;
      const row = prior ? await db.labsCustomerGrant.update({ where: { id: prior.id }, data: { status: "ACTIVE", revokedAt: null, verificationEvidence: input.evidence, issuedByUserId: operatorId } }) : await db.labsCustomerGrant.create({ data: { organizationId: access.divisionId, leadId: lead.id, customerUserId: customer.id, issuedByUserId: operatorId, verificationEvidence: input.evidence } });
      await operationalEvent(db, { actorUserId: operatorId, actorPersonId: access.ctx.user!.personId, organizationId: access.divisionId, action: "labs.customer_access_granted", entityType: "LabsCustomerGrant", entityId: row.id, result: "SUCCESS" });
      return row;
    });
  }

  async function revoke(operatorId: string, grantId: string) {
    return client.$transaction(async db => {
      const access = await operatorAccess(db, operatorId);
      const row = await db.labsCustomerGrant.findFirst({ where: { id: grantId, organizationId: access.divisionId } });
      if (!row) throw new AccessError("Customer access unavailable");
      if (row.status !== "ACTIVE") return;
      await db.labsCustomerGrant.update({ where: { id: row.id }, data: { status: "REVOKED", revokedAt: new Date() } });
      await operationalEvent(db, { actorUserId: operatorId, actorPersonId: access.ctx.user!.personId, organizationId: access.divisionId, action: "labs.customer_access_revoked", entityType: "LabsCustomerGrant", entityId: row.id, result: "SUCCESS" });
    });
  }

  async function dashboard(userId: string) {
    const access = await requirePortalAccess(client, userId, "labs");
    await access.ctx.requireAccess("labs.customer.read", { organizationId: access.divisionId });
    const account = await client.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, personId: true, person: { select: { metadata: true } } } });
    if (!account?.emailVerifiedAt || !account.personId || JSON.parse(account.person?.metadata ?? "{}").authenticationRealm !== "labs") throw new AccessError("Customer identity unavailable");
    const grants = await client.labsCustomerGrant.findMany({ where: { customerUserId: userId, organizationId: access.divisionId, status: "ACTIVE", lead: { kind: "LABS_LEAD", organizationId: access.divisionId } }, include: { lead: { select: { id: true, title: true, status: true, payload: true, projectId: true } } }, take: 50, orderBy: { createdAt: "desc" } });
    const records = [];
    for (const grant of grants) {
      const lead = leadPayload.parse(JSON.parse(grant.lead.payload));
      if (lead.email !== account.email.toLowerCase()) continue;
      const quote = lead.quoteId ? await client.executiveRecord.findFirst({ where: { id: lead.quoteId, organizationId: access.divisionId, kind: "LABS_QUOTE" }, select: { id: true, status: true, payload: true, dueAt: true } }) : null;
      const quotation = quote ? quotePayload.parse(JSON.parse(quote.payload)) : null;
      const proposal = quote && quotation && ["ISSUED", "ACCEPTED"].includes(quote.status) && quotation.input.leadId === grant.leadId && quotation.issuer && quotation.issuedAt ? quote : null;
      const project = lead.projectId && grant.lead.projectId === lead.projectId ? await client.project.findFirst({ where: { id: lead.projectId, organizationId: access.divisionId }, select: { id: true, name: true, status: true, targetDate: true, metadata: true } }) : null;
      const projectMeta = project ? JSON.parse(project.metadata ?? "{}") : null;
      records.push({ id: grant.leadId, enquiry: { company: lead.company, need: lead.need, status: grant.lead.status }, proposal: proposal && quotation ? { id: proposal.id, status: proposal.status, currency: quotation.input.currency, total: quotation.totals.total, items: quotation.input.items, issuer: quotation.issuer!.legalName, expiresAt: proposal.dueAt } : null, project: project && projectMeta.kind === "AIRALABS_PROJECT" && projectMeta.leadId === grant.leadId ? { name: project.name, status: projectMeta.lifecycle ?? project.status, targetDate: project.targetDate, reviewRequested: projectMeta.lifecycle === "CLIENT_ACCEPTANCE" } : null });
    }
    return records;
  }
  async function grantsForLead(operatorId: string, leadId: string) {
    const access = await operatorAccess(client, operatorId);
    return client.labsCustomerGrant.findMany({ where: { leadId, organizationId: access.divisionId }, select: { id: true, status: true, customer: { select: { email: true } } }, take: 25 });
  }
  return { isCustomer, grant, revoke, grantsForLead, dashboard };
}

export const labsCustomerService = createLabsCustomerService();
