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
const optionalEmail = z.union([z.literal(""), z.email().max(254)]).transform(value => value ? value.toLowerCase() : null);
const optionalPhone = z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/)]).transform(value => value || null);
const personDraft = z.object({ companyId: id, personId: id.optional(), displayName: z.string().trim().min(2).max(200).optional(), email: z.email().max(254).transform(v => v.toLowerCase()).optional(), phone: optionalPhone.optional(), contactEmail: optionalEmail.optional(), contactPhone: optionalPhone.optional(), emergencyContactName: z.string().trim().max(160).transform(value => value || null).optional(), emergencyContactRelationship: z.string().trim().max(80).transform(value => value || null).optional(), emergencyContactPhone: optionalPhone.optional(), emergencyContactEmail: optionalEmail.optional(), linkExisting: z.boolean().optional(), designation: z.string().trim().max(120).optional(), employmentType: z.string().trim().min(2).max(80).optional(), joiningDate: z.coerce.date().optional(), initialBrandIds: z.array(id).max(20).optional(), initialDepartmentId: id.optional(), initialManagerPersonId: id.optional(), assignmentDecisionReference: reference.optional(), activateImmediately: z.boolean().optional(), decisionReference: reference.optional() }).strict();
const assignmentDraft = z.object({ employmentId: id, brandId: id, departmentId: id.optional(), managerPersonId: id.optional(), designation: z.string().trim().min(2).max(120), startDate: z.coerce.date(), decisionReference: reference }).strict();
export const hrEmployeeProfileInput = z.object({ employmentId: id, displayName: z.string().trim().min(2).max(200).optional(), contactEmail: optionalEmail, contactPhone: optionalPhone, emergencyContactName: z.string().trim().max(160).transform(value => value || null), emergencyContactRelationship: z.string().trim().max(80).transform(value => value || null), emergencyContactPhone: optionalPhone, emergencyContactEmail: optionalEmail }).strict();

export function hrProfileCompleteness(profile: { displayName?: string | null; email?: string | null; contactEmail?: string | null; contactPhone?: string | null; emergencyContactName?: string | null; emergencyContactRelationship?: string | null; emergencyContactPhone?: string | null; designation?: string | null; startDate?: Date | null }) {
  const checks = [!!profile.displayName, !!(profile.contactEmail || profile.email), !!profile.contactPhone, !!profile.emergencyContactName, !!profile.emergencyContactRelationship, !!profile.emergencyContactPhone, !!profile.designation, !!profile.startDate];
  const complete = checks.filter(Boolean).length;
  return { complete, total: checks.length, percent: Math.round(complete / checks.length * 100), missing: checks.flatMap((ok, i) => ok ? [] : [(["Name", "Contact email", "Phone", "Emergency contact name", "Relationship", "Emergency phone", "Role", "Joining date"] as const)[i]]) };
}

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
    return client.employment.findMany({ where: { companyId: { in: query.companyId ? [query.companyId] : ids }, ...(query.brandId || query.departmentId ? { assignments: { some: { ...(query.brandId ? { brandId: query.brandId } : {}), ...(query.departmentId ? { departmentId: query.departmentId } : {}) } } } : {}), ...(state.success ? { status: state.data } : {}), ...(query.search ? { person: { displayName: { contains: query.search.slice(0, 100), mode: "insensitive" } } } : {}) }, include: { person: { select: { id: true, displayName: true, email: true, status: true, users: { select: { id: true, email: true, status: true, emailVerifiedAt: true, emailAuthChallenges: { where: { purpose: "STAFF_INVITE" }, select: { status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } } } } }, company: { select: { name: true, slug: true } }, assignments: { select: { id: true, employmentId: true, brandId: true, departmentId: true, managerPersonId: true, designation: true, status: true, startDate: true, endDate: true, decisionReference: true, createdAt: true, updatedAt: true, brand: { select: { name: true, organizationId: true } }, department: { select: { name: true } }, manager: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51 });
  }
  async function get(actorId: string, employmentId: string) {
    const row = await client.employment.findUnique({ where: { id: employmentId }, include: { person: { select: { id: true, displayName: true, email: true, phone: true } }, company: { select: { name: true } }, assignments: { select: { id: true, employmentId: true, brandId: true, departmentId: true, managerPersonId: true, designation: true, status: true, startDate: true, endDate: true, decisionReference: true, createdAt: true, updatedAt: true, brand: { select: { id: true, name: true, slug: true } }, department: { select: { name: true } }, manager: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } } } });
    if (!row) throw new AccessError("Employee unavailable");
    await authorized(actorId, client, row.companyId);
    return row;
  }
  async function updateProfile(actorId: string, raw: unknown) {
    const input = hrEmployeeProfileInput.parse(raw);
    return client.$transaction(async db => {
      const row = await db.employment.findUnique({ where: { id: input.employmentId }, include: { person: { select: { displayName: true, email: true } } } });
      if (!row || row.status === "ENDED") throw new AccessError("Active employment profile unavailable");
      const ctx = await authorized(actorId, db, row.companyId, "person.update");
      if (input.displayName) await db.person.update({ where: { id: row.personId }, data: { displayName: input.displayName } });
      const updated = await db.employment.update({ where: { id: row.id }, data: { contactEmail: input.contactEmail, contactPhone: input.contactPhone, emergencyContactName: input.emergencyContactName, emergencyContactRelationship: input.emergencyContactRelationship, emergencyContactPhone: input.emergencyContactPhone, emergencyContactEmail: input.emergencyContactEmail }, include: { person: { select: { displayName: true, email: true } } } });
      const completeness = hrProfileCompleteness({ ...updated, displayName: updated.person.displayName, email: updated.person.email });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: "hr.employee_profile_updated", entityType: "Employment", entityId: row.id, result: "SUCCESS", metadata: { profileCompleteness: completeness.percent, fields: [...(input.displayName ? ["displayName"] : []), "contactEmail", "contactPhone", "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone", "emergencyContactEmail"] } });
      return { completeness };
    });
  }
  async function canUpdateProfile(actorId: string, employmentId: string) {
    const row = await client.employment.findUnique({ where: { id: employmentId }, select: { companyId: true } });
    if (!row) return false;
    try { await authorized(actorId, client, row.companyId, "person.update"); return true; }
    catch (error) { if (error instanceof AccessError) return false; throw error; }
  }
  async function create(actorId: string, raw: unknown) {
    const input = personDraft.parse(raw);
    if (!input.personId && (!input.displayName || !input.email)) throw new AccessError("Choose an existing person or provide a name and email");
    const initialBrandIds = [...new Set(input.initialBrandIds ?? [])];
    if (input.activateImmediately && (!input.joiningDate || !input.decisionReference)) throw new AccessError("Appointment date and decision reference required");
    if (!initialBrandIds.length && (input.initialDepartmentId || input.initialManagerPersonId || input.assignmentDecisionReference)) throw new AccessError("Select a brand before configuring an assignment");
    if (initialBrandIds.length && (!input.designation || !input.joiningDate || !input.assignmentDecisionReference)) throw new AccessError("Designation, joining date and decision reference are required for brand assignments");
    return client.$transaction(async db => {
      const ctx = await authorized(actorId, db, input.companyId, "person.create");
      let groupBossAppointment = false;
      if (input.activateImmediately) { await boss.authority(actorId, db); groupBossAppointment = true; }
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
        const person = await db.person.findUnique({ where: { id: personId }, select: { id: true, status: true, phone: true } });
        if (!person || person.status !== "ACTIVE") throw new AccessError("Person unavailable");
        if (input.phone && person.phone && input.phone !== person.phone) throw new AccessError("This person already has a different verified contact number; review the existing profile first");
        if (!person.phone && input.phone) await db.person.update({ where: { id: person.id }, data: { phone: input.phone } });
      } else {
        const existing = await db.person.findUnique({ where: { email: input.email! }, select: { id: true, status: true, phone: true } });
        if (existing) {
          if (!input.linkExisting || existing.status !== "ACTIVE") throw new AccessError("An existing person uses this email; choose explicit linking");
          if (input.phone && existing.phone && input.phone !== existing.phone) throw new AccessError("This person already has a different verified contact number; review the existing profile first");
          personId = existing.id;
          if (!existing.phone && input.phone) await db.person.update({ where: { id: existing.id }, data: { phone: input.phone } });
        } else {
          if (input.linkExisting) throw new AccessError("No existing person matches this email");
          const person = await db.person.create({ data: { displayName: input.displayName!, email: input.email!, phone: input.phone ?? null }, select: { id: true } });
          personId = person.id;
        }
      }
      const open = await db.employment.findFirst({ where: { personId, companyId: input.companyId, status: { not: "ENDED" } } });
      if (open) throw new AccessError("An open employment record already exists");
      if (input.initialManagerPersonId) {
        if (!initialBrandIds.length || input.initialManagerPersonId === personId) throw new AccessError("Choose a distinct manager for an assigned brand");
        const isAppointingBoss = groupBossAppointment && input.initialManagerPersonId === ctx.user?.personId;
        const manager = isAppointingBoss ? { id: "group-boss" } : await db.employment.findFirst({ where: { personId: input.initialManagerPersonId, companyId: input.companyId, status: "ACTIVE" }, select: { id: true } });
        const scopes = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === input.companyId)).map(node => node.id);
        const verified = await db.user.findFirst({ where: { personId: input.initialManagerPersonId, status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { organizationId: { in: scopes }, status: "ACTIVE" } } } }, select: { id: true } });
        const assignments = manager && !isAppointingBoss ? await db.hrAssignment.findMany({ where: { employmentId: manager.id, brandId: { in: initialBrandIds }, status: "ACTIVE" }, select: { brandId: true } }) : [];
        if (!manager || !isAppointingBoss && !verified || !isAppointingBoss && initialBrandIds.some(brandId => !assignments.some(assignment => assignment.brandId === brandId))) throw new AccessError("Choose an active reporting person with access to this work area");
      }
      const personContact = await db.person.findUnique({ where: { id: personId! }, select: { email: true, phone: true } });
      const row = await db.employment.create({ data: { personId: personId!, companyId: input.companyId, designation: input.designation || null, employmentType: input.employmentType ?? null, startDate: input.joiningDate ?? null, status: input.activateImmediately ? "ACTIVE" : "DRAFT", decisionReference: input.decisionReference, contactEmail: input.contactEmail ?? personContact?.email ?? null, contactPhone: input.contactPhone ?? personContact?.phone ?? null, emergencyContactName: input.emergencyContactName ?? null, emergencyContactRelationship: input.emergencyContactRelationship ?? null, emergencyContactPhone: input.emergencyContactPhone ?? null, emergencyContactEmail: input.emergencyContactEmail ?? null } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: input.activateImmediately ? "hr.employment_appointed" : "hr.employment_drafted", entityType: "Employment", entityId: row.id, result: "SUCCESS", metadata: input.activateImmediately ? { decisionReference: input.decisionReference } : undefined });
      for (const brandId of initialBrandIds) {
        const assignment = await db.hrAssignment.create({ data: { employmentId: row.id, brandId, departmentId: input.initialDepartmentId, managerPersonId: input.initialManagerPersonId, designation: input.designation!, startDate: input.joiningDate!, status: input.activateImmediately ? "ACTIVE" : "DRAFT", decisionReference: input.assignmentDecisionReference ?? input.decisionReference } });
        await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: input.activateImmediately ? "hr.assignment_activated" : "hr.assignment_drafted", entityType: "HrAssignment", entityId: assignment.id, result: "SUCCESS", metadata: { decisionReference: input.assignmentDecisionReference ?? input.decisionReference, brandId } });
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
  async function removeEmployee(actorId: string, raw: unknown) {
    const input = z.object({ employmentId: id, mode: z.enum(["archive", "permanent"]), confirmation: z.string().optional() }).strict().parse(raw);
    return client.$transaction(async db => {
      const row = await db.employment.findUnique({ where: { id: input.employmentId }, include: { person: { select: { displayName: true } } } });
      if (!row) throw new AccessError("Employee record is unavailable");
      const ctx = await authorized(actorId, db, row.companyId, "person.update");
      if (input.mode === "permanent") {
        await boss.authority(actorId, db);
        if (input.confirmation !== "DELETE") throw new AccessError("Type DELETE to confirm permanent removal");
      }

      const at = new Date();
      const scopeIds = ctx.nodes.filter(node => ancestry(ctx.nodes, node.id).some(parent => parent.id === row.companyId)).map(node => node.id);
      const memberships = await db.membership.findMany({ where: { personId: row.personId, organizationId: { in: scopeIds }, status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] } }, select: { id: true, organizationId: true } });
      for (const membership of memberships) await ctx.requireAccess("membership.manage", { organizationId: membership.organizationId });

      if (input.mode === "permanent") {
        const [documents, compensation, payroll, letters, convertedCandidates] = await Promise.all([
          db.hrDocument.findFirst({ where: { employmentId: row.id }, select: { id: true } }),
          db.hrCompensation.findFirst({ where: { employmentId: row.id }, select: { id: true } }),
          db.hrPayrollLine.findFirst({ where: { employmentId: row.id }, select: { id: true } }),
          db.hrLetter.findFirst({ where: { employmentId: row.id }, select: { id: true } }),
          db.hrCandidate.findFirst({ where: { convertedEmploymentId: row.id }, select: { id: true } }),
        ]);
        if (documents || compensation || payroll || letters || convertedCandidates) {
          throw new AccessError("This employee has retained HR or financial records. Choose ‘Remove and keep in history’ so those records remain linked.");
        }
      }

      await db.hrAssignment.updateMany({ where: { employmentId: row.id, status: { in: ["ACTIVE", "DRAFT"] } }, data: { status: "ENDED", endDate: at } });
      if (memberships.length) {
        await db.membership.updateMany({ where: { id: { in: memberships.map(member => member.id) } }, data: { status: "ENDED", endDate: at } });
      }
      const userIds = (await db.user.findMany({ where: { personId: row.personId }, select: { id: true } })).map(user => user.id);
      if (userIds.length) await db.emailAuthChallenge.updateMany({ where: { userId: { in: userIds }, purpose: "STAFF_INVITE", status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });

      if (input.mode === "permanent") {
        // Preserve the shared Person/User identity and operational audit trail; remove only this HR employment and its assignments.
        await db.hrAssignment.deleteMany({ where: { employmentId: row.id } });
        await db.employment.delete({ where: { id: row.id } });
      } else {
        await db.employment.update({ where: { id: row.id }, data: { status: "ENDED", endDate: row.endDate ?? at } });
      }
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: row.companyId, action: input.mode === "permanent" ? "hr.employee_removed_permanently" : "hr.employee_archived", entityType: "Employment", entityId: row.id, result: "SUCCESS", metadata: { employmentStatus: row.status, assignmentIds: input.mode === "permanent" ? "removed" : "retained", membershipIds: memberships.map(member => member.id), personIdentityRetained: true } });
      return { mode: input.mode, displayName: row.person.displayName, companyId: row.companyId };
    });
  }
  return { list, get, create, addAssignment, changeAssignment, changeEmployment, removeEmployee, updateProfile, canUpdateProfile };
}

export const hrEmploymentService = createHrEmploymentService();
