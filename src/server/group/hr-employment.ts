import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { ancestry } from "@/server/authorization/business-scope";
import { createBossService } from "./boss-service";
import { operationalEvent } from "@/server/domain/operational-events";
import { marketingDivisionSlug } from "./brand-marketing-scope";

const id = z.string().min(1).max(200);
const reference = z.string().trim().min(8).max(200);
const personDraft = z.object({ companyId: id, personId: id.optional(), displayName: z.string().trim().min(2).max(200).optional(), email: z.email().max(254).transform(v => v.toLowerCase()).optional(), linkExisting: z.boolean().optional(), designation: z.string().trim().max(120).optional(), employmentType: z.string().trim().min(2).max(80).optional(), joiningDate: z.coerce.date().optional(), initialBrandIds: z.array(id).max(20).optional(), initialDepartmentId: id.optional(), initialManagerPersonId: id.optional(), assignmentDecisionReference: reference.optional() }).strict();
const assignmentDraft = z.object({ employmentId: id, brandId: id, departmentId: id.optional(), managerPersonId: id.optional(), designation: z.string().trim().min(2).max(120), startDate: z.coerce.date(), decisionReference: reference }).strict();

export function createHrEmploymentService(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function authorized(actorId: string, db: Prisma.TransactionClient, companyId: string, action = "person.read") {
    const { ctx, root } = await boss.authority(actorId, db);
    const company = await db.organization.findFirst({ where: { id: companyId, type: "COMPANY", parentId: root.id }, select: { id: true, status: true } });
    if (!company) throw new AccessError("Company unavailable");
    if (action === "person.create" && company.status !== "ACTIVE") throw new AccessError("Company is not active");
    await ctx.requireAccess(action, { organizationId: companyId });
    return ctx;
  }
  async function list(actorId: string, query: { companyId?: string; brandId?: string; departmentId?: string; status?: string; search?: string; page?: number } = {}) {
    const { ctx, root } = await boss.authority(actorId);
    const companies = await client.organization.findMany({ where: { type: "COMPANY", parentId: root.id, id: { in: ctx.organizationIds("person.read") } }, select: { id: true } });
    const ids = companies.map(c => c.id);
    if (query.companyId && !ids.includes(query.companyId)) throw new AccessError("Company unavailable");
    if (query.brandId) {
      const brand = await client.brand.findFirst({ where: { id: query.brandId, organizationId: { in: query.companyId ? [query.companyId] : ids } }, select: { id: true } });
      if (!brand) throw new AccessError("Brand unavailable");
    }
    if (query.departmentId) {
      const department = await client.organization.findFirst({ where: { id: query.departmentId, type: "DEPARTMENT" }, select: { id: true } });
      if (!department || !ids.some(companyId => ancestry(ctx.nodes, department.id).some(node => node.id === companyId))) throw new AccessError("Department unavailable");
    }
    const state = z.enum(["DRAFT", "ACTIVE", "ENDED"]).safeParse(query.status);
    const page = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).parse(query.page ?? 1);
    return client.employment.findMany({ where: { companyId: { in: query.companyId ? [query.companyId] : ids }, ...(query.brandId || query.departmentId ? { assignments: { some: { ...(query.brandId ? { brandId: query.brandId } : {}), ...(query.departmentId ? { departmentId: query.departmentId } : {}) } } } : {}), ...(state.success ? { status: state.data } : {}), ...(query.search ? { person: { displayName: { contains: query.search.slice(0, 100), mode: "insensitive" } } } : {}) }, include: { person: { select: { id: true, displayName: true, email: true, status: true, users: { select: { id: true, email: true, status: true, emailVerifiedAt: true, emailAuthChallenges: { where: { purpose: "STAFF_INVITE" }, select: { status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } } } } }, company: { select: { name: true, slug: true } }, assignments: { include: { brand: { select: { name: true, organizationId: true } }, department: { select: { name: true } }, manager: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51 });
  }
  async function get(actorId: string, employmentId: string) {
    const row = await client.employment.findUnique({ where: { id: employmentId }, include: { person: { select: { id: true, displayName: true, email: true } }, company: { select: { name: true } }, assignments: { include: { brand: { select: { id: true, name: true } }, department: { select: { name: true } }, manager: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } } } });
    if (!row) throw new AccessError("Employee unavailable");
    await authorized(actorId, client, row.companyId);
    return row;
  }
  async function create(actorId: string, raw: unknown) {
    const input = personDraft.parse(raw);
    if (!input.personId && (!input.displayName || !input.email)) throw new AccessError("Choose an existing person or provide a name and email");
    const initialBrandIds = [...new Set(input.initialBrandIds ?? [])];
    if (!initialBrandIds.length && (input.initialDepartmentId || input.initialManagerPersonId || input.assignmentDecisionReference)) throw new AccessError("Select a brand before configuring an assignment");
    if (initialBrandIds.length && (!input.designation || !input.joiningDate || !input.assignmentDecisionReference)) throw new AccessError("Designation, joining date and decision reference are required for brand assignments");
    return client.$transaction(async db => {
      const ctx = await authorized(actorId, db, input.companyId, "person.create");
      if (initialBrandIds.length) {
        await ctx.requireAccess("person.update", { organizationId: input.companyId });
        const found = await db.brand.findMany({ where: { id: { in: initialBrandIds }, organizationId: input.companyId, status: "ACTIVE" }, select: { id: true } });
        if (found.length !== initialBrandIds.length) throw new AccessError("An assignment brand is unavailable in this company");
        if (input.initialDepartmentId) {
          const department = await db.organization.findFirst({ where: { id: input.initialDepartmentId, type: "DEPARTMENT" }, select: { id: true } });
          if (!department || !ancestry(ctx.nodes, department.id).some(node => node.id === input.companyId)) throw new AccessError("Department unavailable in this company");
        }
      }
      let personId = input.personId;
      if (personId) {
        const person = await db.person.findUnique({ where: { id: personId }, select: { id: true, status: true } });
        if (!person || person.status !== "ACTIVE") throw new AccessError("Person unavailable");
      } else {
        const existing = await db.person.findUnique({ where: { email: input.email! }, select: { id: true, status: true } });
        if (existing) {
          if (!input.linkExisting || existing.status !== "ACTIVE") throw new AccessError("An existing person uses this email; choose explicit linking");
          personId = existing.id;
        } else {
          if (input.linkExisting) throw new AccessError("No existing person matches this email");
          const person = await db.person.create({ data: { displayName: input.displayName!, email: input.email! }, select: { id: true } });
          personId = person.id;
        }
      }
      const open = await db.employment.findFirst({ where: { personId, companyId: input.companyId, status: { not: "ENDED" } } });
      if (open) throw new AccessError("An open employment record already exists");
      if (input.initialManagerPersonId) {
        if (!initialBrandIds.length || input.initialManagerPersonId === personId) throw new AccessError("Choose a distinct manager for an assigned brand");
        const manager = await db.employment.findFirst({ where: { personId: input.initialManagerPersonId, companyId: input.companyId, status: "ACTIVE" }, select: { id: true } });
        const scopes = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === input.companyId)).map(node => node.id);
        const verified = await db.user.findFirst({ where: { personId: input.initialManagerPersonId, status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { organizationId: { in: scopes }, status: "ACTIVE" } } } }, select: { id: true } });
        const assignments = manager ? await db.hrAssignment.findMany({ where: { employmentId: manager.id, brandId: { in: initialBrandIds }, status: "ACTIVE" }, select: { brandId: true } }) : [];
        if (!manager || !verified || initialBrandIds.some(brandId => !assignments.some(assignment => assignment.brandId === brandId))) throw new AccessError("Verified manager with an active assignment to every selected brand required");
      }
      const row = await db.employment.create({ data: { personId: personId!, companyId: input.companyId, designation: input.designation || null, employmentType: input.employmentType ?? null, startDate: input.joiningDate ?? null } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.employment_drafted", entityType: "Employment", entityId: row.id, result: "SUCCESS" });
      for (const brandId of initialBrandIds) {
        const assignment = await db.hrAssignment.create({ data: { employmentId: row.id, brandId, departmentId: input.initialDepartmentId, managerPersonId: input.initialManagerPersonId, designation: input.designation!, startDate: input.joiningDate!, decisionReference: input.assignmentDecisionReference } });
        await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.assignment_drafted", entityType: "HrAssignment", entityId: assignment.id, result: "SUCCESS", metadata: { decisionReference: input.assignmentDecisionReference, brandId } });
      }
      return row.id;
    });
  }
  async function addAssignment(actorId: string, raw: unknown) {
    const input = assignmentDraft.parse(raw);
    return client.$transaction(async db => {
      const employment = await db.employment.findUnique({ where: { id: input.employmentId }, select: { id: true, companyId: true, personId: true, status: true } });
      if (!employment || employment.status === "ENDED") throw new AccessError("Employment unavailable");
      const ctx = await authorized(actorId, db, employment.companyId, "person.update");
      const brand = await db.brand.findFirst({ where: { id: input.brandId, organizationId: employment.companyId, status: "ACTIVE" }, select: { id: true } });
      if (!brand) throw new AccessError("Brand does not belong to this company");
      if (input.departmentId) {
        const department = await db.organization.findFirst({ where: { id: input.departmentId, type: "DEPARTMENT" }, select: { id: true } });
        if (!department || !ancestry(ctx.nodes, department.id).some(node => node.id === employment.companyId)) throw new AccessError("Department unavailable in this company");
      }
      if (input.managerPersonId) {
        if (input.managerPersonId === employment.personId) throw new AccessError("Employee cannot manage themselves");
        const manager = await db.employment.findFirst({ where: { personId: input.managerPersonId, companyId: employment.companyId, status: "ACTIVE" }, select: { id: true } });
        const scopes = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === employment.companyId)).map(node => node.id);
        const verified = await db.user.findFirst({ where: { personId: input.managerPersonId, status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { organizationId: { in: scopes }, status: "ACTIVE" } } } }, select: { id: true } });
        const managerAssignment = await db.hrAssignment.findFirst({ where: { employmentId: manager?.id ?? "", brandId: input.brandId, status: "ACTIVE" }, select: { id: true } });
        if (!manager || !verified || !managerAssignment) throw new AccessError("Verified manager with an active assignment to this brand required");
      }
      if (await db.hrAssignment.findFirst({ where: { employmentId: employment.id, brandId: input.brandId, status: { in: ["DRAFT", "ACTIVE"] } } })) throw new AccessError("Open brand assignment already exists");
      const row = await db.hrAssignment.create({ data: { employmentId: employment.id, brandId: input.brandId, departmentId: input.departmentId, managerPersonId: input.managerPersonId, designation: input.designation, startDate: input.startDate, decisionReference: input.decisionReference } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: employment.companyId, action: "hr.assignment_drafted", entityType: "HrAssignment", entityId: row.id, result: "SUCCESS", metadata: { decisionReference: input.decisionReference, brandId: input.brandId } });
      return row.id;
    });
  }
  async function changeAssignment(actorId: string, raw: unknown) {
    const input = z.object({ assignmentId: id, action: z.enum(["activate", "transfer", "end", "edit"]), decisionReference: reference, nextBrandId: id.optional(), endDate: z.coerce.date().optional(), designation: z.string().trim().min(2).max(120).optional(), departmentId: id.optional(), managerPersonId: id.optional() }).strict().parse(raw);
    return client.$transaction(async db => {
      const row = await db.hrAssignment.findUnique({ where: { id: input.assignmentId }, include: { employment: true } });
      if (!row) throw new AccessError("Assignment unavailable");
      const ctx = await authorized(actorId, db, row.employment.companyId, "person.update");
      const at = input.endDate ?? new Date();
      if (input.action === "edit") {
        if (!input.designation || !["DRAFT", "ACTIVE"].includes(row.status)) throw new AccessError("Assignment unavailable for editing");
        if (input.departmentId) {
          const department = await db.organization.findFirst({ where: { id: input.departmentId, type: "DEPARTMENT" }, select: { id: true } });
          if (!department || !ancestry(ctx.nodes, department.id).some(node => node.id === row.employment.companyId)) throw new AccessError("Department unavailable in this company");
        }
        if (input.managerPersonId) {
          const scopes = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === row.employment.companyId)).map(node => node.id);
          const manager = await db.employment.findFirst({ where: { personId: input.managerPersonId, companyId: row.employment.companyId, status: "ACTIVE" }, select: { id: true } });
          const brandAssignment = manager ? await db.hrAssignment.findFirst({ where: { employmentId: manager.id, brandId: row.brandId, status: "ACTIVE" }, select: { id: true } }) : null;
          if (input.managerPersonId === row.employment.personId || !manager || !brandAssignment || !(await db.user.findFirst({ where: { personId: input.managerPersonId, status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { organizationId: { in: scopes }, status: "ACTIVE" } } } } }))) throw new AccessError("Verified manager with an active assignment to this brand required");
        }
        await db.hrAssignment.update({ where: { id: row.id }, data: { designation: input.designation, departmentId: input.departmentId ?? null, managerPersonId: input.managerPersonId ?? null, decisionReference: input.decisionReference } });
      } else if (input.action === "activate") {
        if (row.status !== "DRAFT" || row.employment.status !== "ACTIVE") throw new AccessError("Active employment and draft assignment required");
        await db.hrAssignment.update({ where: { id: row.id }, data: { status: "ACTIVE", decisionReference: input.decisionReference } });
      } else {
        if (row.status !== "ACTIVE" || at < row.startDate) throw new AccessError("Active assignment and valid end date required");
        if (input.action === "transfer") {
          if (!input.nextBrandId || input.nextBrandId === row.brandId) throw new AccessError("Choose another brand");
          const target = await db.brand.findFirst({ where: { id: input.nextBrandId, organizationId: row.employment.companyId, status: "ACTIVE" }, select: { id: true } });
          if (!target || await db.hrAssignment.findFirst({ where: { employmentId: row.employmentId, brandId: target.id, status: { in: ["DRAFT", "ACTIVE"] } } })) throw new AccessError("Target brand unavailable");
          // A destination brand requires fresh department and manager decisions.
          await db.hrAssignment.create({ data: { employmentId: row.employmentId, brandId: target.id, departmentId: null, managerPersonId: null, designation: row.designation, status: "ACTIVE", startDate: at, decisionReference: input.decisionReference } });
        }
        await db.hrAssignment.update({ where: { id: row.id }, data: { status: input.action === "transfer" ? "TRANSFERRED" : "ENDED", endDate: at, decisionReference: input.decisionReference } });
        const oldBrand = await db.brand.findUnique({ where: { id: row.brandId }, select: { slug: true, parentBrandId: true } });
        const divisionSlug = oldBrand && !oldBrand.parentBrandId ? marketingDivisionSlug(oldBrand.slug) : undefined;
        const oldDivision = divisionSlug ? await db.organization.findFirst({ where: { slug: divisionSlug, parentId: row.employment.companyId, type: "DIVISION" }, select: { id: true } }) : null;
        if (oldDivision) {
          const access = await db.membership.findMany({ where: { personId: row.employment.personId, organizationId: oldDivision.id, status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] } }, select: { id: true } });
          if (access.length) {
            await ctx.requireAccess("membership.manage", { organizationId: oldDivision.id });
            await db.membership.updateMany({ where: { id: { in: access.map(item => item.id) } }, data: { status: "ENDED", endDate: at } });
            await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: oldDivision.id, action: "hr.brand_access_revoked", entityType: "HrAssignment", entityId: row.id, result: "SUCCESS", metadata: { membershipIds: access.map(item => item.id) } });
          }
        }
      }
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.employment.companyId, action: `hr.assignment_${input.action}`, entityType: "HrAssignment", entityId: row.id, result: "SUCCESS", metadata: { decisionReference: input.decisionReference, nextBrandId: input.nextBrandId ?? null, previousDesignation: row.designation, designation: input.designation ?? row.designation } });
    });
  }
  async function changeEmployment(actorId: string, raw: unknown) {
    const input = z.object({ employmentId: id, action: z.enum(["activate", "end", "edit"]), decisionReference: reference, designation: z.string().trim().min(2).max(120).optional(), employmentType: z.string().trim().min(2).max(80).optional(), joiningDate: z.coerce.date().optional() }).strict().parse(raw);
    return client.$transaction(async db => {
      const row = await db.employment.findUnique({ where: { id: input.employmentId } });
      if (!row) throw new AccessError("Employment unavailable");
      const ctx = await authorized(actorId, db, row.companyId, "person.update");
      if (input.action === "activate" && row.status !== "DRAFT" || input.action === "end" && row.status !== "ACTIVE" || input.action === "edit" && (row.status === "ENDED" || !input.designation && !input.employmentType)) throw new AccessError("Invalid employment transition");
      const at = new Date();
      await db.employment.update({ where: { id: row.id }, data: input.action === "activate" ? { status: "ACTIVE", startDate: input.joiningDate ?? row.startDate ?? at, decisionReference: input.decisionReference } : input.action === "end" ? { status: "ENDED", endDate: at, decisionReference: input.decisionReference } : { ...(input.designation ? { designation: input.designation } : {}), ...(input.employmentType ? { employmentType: input.employmentType } : {}), decisionReference: input.decisionReference } });
      if (input.action === "end") {
        await db.hrAssignment.updateMany({ where: { employmentId: row.id, status: "ACTIVE" }, data: { status: "ENDED", endDate: at } });
        await db.hrAssignment.updateMany({ where: { employmentId: row.id, status: "DRAFT" }, data: { status: "ENDED" } });
        const scopeIds = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === row.companyId)).map(node => node.id);
        const memberships = await db.membership.findMany({ where: { personId: row.personId, organizationId: { in: scopeIds }, status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] } }, select: { id: true, organizationId: true } });
        for (const membership of memberships) await ctx.requireAccess("membership.manage", { organizationId: membership.organizationId });
        if (memberships.length) {
          await db.membership.updateMany({ where: { id: { in: memberships.map(member => member.id) } }, data: { status: "ENDED", endDate: at } });
          await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "hr.company_access_revoked", entityType: "Employment", entityId: row.id, result: "SUCCESS", metadata: { membershipIds: memberships.map(member => member.id) } });
        }
        const company = await db.organization.findUnique({ where: { id: row.companyId }, select: { slug: true } });
        if (company?.slug === "aira-skill-city") {
          const accountIds = (await db.user.findMany({ where: { personId: row.personId }, select: { id: true } })).map(item => item.id);
          if (accountIds.length) await db.emailAuthChallenge.updateMany({ where: { userId: { in: accountIds }, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
        }
      }
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: `hr.employment_${input.action}`, entityType: "Employment", entityId: row.id, result: "SUCCESS", metadata: { decisionReference: input.decisionReference, previousDesignation: row.designation, designation: input.designation ?? row.designation } });
    });
  }
  return { list, get, create, addAssignment, changeAssignment, changeEmployment };
}

export const hrEmploymentService = createHrEmploymentService();
