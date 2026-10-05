import { READ_BUDGET, boundedRead } from "./query-bounds";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { activeMembershipWhere, ancestry, canAccessOrganization } from "@/server/authorization/business-scope";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { canNestOrganization } from "./organization";
import * as input from "./business-input";
import { createAccessContext as defaultAccessContext } from "@/server/authorization/engine";
import { setHumanMembershipRole, validateMembershipAuthority } from "@/server/authorization/assignments";
import { createExecutionService } from "./execution-service";
import { validateProductDivision, protectCanonicalDivision } from "./company-structure";

export class BusinessError extends Error {}
type DB = Prisma.TransactionClient;
const readKeys = { groups: "organization.read", companies: "company.read", organizations: "organization.read", relationships: "company.read", ownership: "ownership.read", people: "membership.read", memberships: "membership.read", brands: "brand.read", products: "product.read", projects: "project.read", goals: "goal.read" };
const manageKeys = { groups: "organization.manage", companies: "company.manage", organizations: "organization.manage", relationships: "company.manage", ownership: "ownership.manage", people: "membership.manage", memberships: "membership.manage", brands: "brand.manage", products: "product.manage", projects: "project.manage", goals: "goal.manage" };

export function createBusinessService(client: PrismaClient = prisma, createAccessContext = defaultAccessContext) {
  async function context(db: DB, userId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, personId: true, status: true } });
    if (!user || user.status !== "ACTIVE") throw new BusinessError("Access denied");
    const access = await createAccessContext(userId, db);
    const { grants, nodes } = access;
    const allowed = (key: string, id: string) => canAccessOrganization(grants, nodes, key, id);
    const requireAccess = (key: string, id: string) => { if (!allowed(key, id)) throw new BusinessError("Access denied"); };
    const ids = access.organizationIds;
    return { user, grants, nodes, allowed, requireAccess, ids };
  }

  async function list(userId: string, kind: input.BusinessKind, organizationId?: string) {
    if (kind === "projects" || kind === "goals") return createExecutionService(client, createAccessContext).list(userId, kind, { organizationId });
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const key = readKeys[kind];
      if (organizationId) ctx.requireAccess(key, organizationId);
      const ids = ctx.ids(key).filter(id => !organizationId || ancestry(ctx.nodes, id).some(n => n.id === organizationId));
      const where = { organizationId: { in: ids } };
      switch (kind) {
        case "groups": return boundedRead(take => db.groupProfile.findMany({ take, where, include: { organization: { select: { slug: true, parentId: true } } }, orderBy: { name: "asc" } }));
        case "companies": return boundedRead(take => db.companyProfile.findMany({ take, where, include: { organization: { select: { slug: true, parentId: true } } }, orderBy: { displayName: "asc" } }));
        case "organizations": return boundedRead(take => db.organization.findMany({ take, where: { id: { in: ids } }, orderBy: { name: "asc" } }));
        case "relationships": return boundedRead(take => db.companyRelationship.findMany({ take, where: { fromCompany: where, toCompany: where }, include: { fromCompany: { select: { displayName: true } }, toCompany: { select: { displayName: true } } } }));
        case "ownership": return boundedRead(take => db.ownershipRelationship.findMany({ take, where: { company: where, OR: [{ ownerOrgId: null }, { ownerOrgId: { in: ctx.ids("organization.read") } }] }, include: { company: { select: { displayName: true } }, ownerPerson: { select: { displayName: true } }, ownerOrg: { select: { name: true } } } }));
        case "people": return boundedRead(take => db.person.findMany({ take, where: { memberships: { some: where } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }));
        case "memberships": return boundedRead(take => db.membership.findMany({ take, where, include: { person: { select: { displayName: true } }, roles: { take: READ_BUDGET + 1, include: { role: { select: { key: true, name: true } } } } } }));
        case "brands": return boundedRead(take => db.brand.findMany({ take, where, orderBy: { name: "asc" } }));
        case "products": return boundedRead(take => db.product.findMany({ take, where, orderBy: { name: "asc" } }));
      }
    });
  }

  async function save(userId: string, kind: input.BusinessKind, raw: unknown, recordId?: string) {
    if (kind === "projects" || kind === "goals") return createExecutionService(client, createAccessContext).save(userId, kind, raw, recordId);
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const key = manageKeys[kind];
      const getOrg = async (id: string) => {
        ctx.requireAccess(key, id);
        const org = await db.organization.findUnique({ where: { id } });
        if (!org) throw new BusinessError("Organization unavailable");
        return org;
      };
      const company = async (id: string) => {
        const row = await db.companyProfile.findUnique({ where: { id } });
        if (!row) throw new BusinessError("Company unavailable");
        ctx.requireAccess(key, row.organizationId);
        return row;
      };
      const personVisible = async (id: string) => {
        const row = await db.person.findFirst({ where: { id, memberships: { some: { organizationId: { in: ctx.ids("membership.read") } } } } });
        if (!row) throw new BusinessError("Person unavailable");
      };
      const linked = async (type: "brand" | "product" | "project", id: string | null | undefined, orgId: string) => {
        if (!id) return null;
        const row = type === "brand" ? await db.brand.findUnique({ where: { id } }) : type === "product" ? await db.product.findUnique({ where: { id } }) : await db.project.findUnique({ where: { id } });
        if (!row || row.organizationId !== orgId) throw new BusinessError("Related resource belongs to a different organization");
        ctx.requireAccess(type + ".read", row.organizationId);
        return row;
      };
      let resource: { id: string };
      let organizationId: string;
      switch (kind) {
        case "groups": {
          const data = input.groupInput.parse(raw);
          if (recordId) {
            const existing = await db.groupProfile.findUnique({ where: { id: recordId } });
            if (!existing) throw new BusinessError("Group unavailable");
            organizationId = existing.organizationId;
            await getOrg(organizationId);
            resource = await db.groupProfile.update({ where: { id: recordId }, data: { name: data.name, description: data.description, status: data.status, metadata: data.metadata } });
            await db.organization.update({ where: { id: organizationId }, data });
          } else {
            if (!ctx.grants.some(g => g.key === key && g.scope === "GLOBAL")) throw new BusinessError("Global organization.manage required");
            const org = await db.organization.create({ data: { ...data, type: "GROUP", group: { create: { name: data.name, description: data.description, status: data.status, metadata: data.metadata } } }, include: { group: true } });
            organizationId = org.id;
            resource = org.group!;
          }
          break;
        }
        case "companies": {
          const { groupOrganizationId, legalName, shortName, companyType, country, region, identifiers, ...data } = input.companyInput.parse(raw);
          let groupId: string | null = null;
          if (!recordId && groupOrganizationId) {
            await getOrg(groupOrganizationId);
            const group = await db.groupProfile.findUnique({ where: { organizationId: groupOrganizationId } });
            if (!group) throw new BusinessError("A company parent must be a group");
            groupId = group.id;
          } else if (!recordId && !ctx.grants.some(g => g.key === key && g.scope === "GLOBAL")) throw new BusinessError("Global company.manage required for a standalone company");
          const profile = { legalName, displayName: data.name, shortName, companyType, country, region, identifiers, description: data.description, status: data.status, metadata: data.metadata };
          if (recordId) {
            const existing = await company(recordId);
            organizationId = existing.organizationId;
            const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
            if (groupOrganizationId !== undefined && (groupOrganizationId ?? null) !== org.parentId) throw new BusinessError("Moving a company between groups requires a future controlled migration");
            resource = await db.companyProfile.update({ where: { id: recordId }, data: profile });
            await db.organization.update({ where: { id: organizationId }, data });
          } else {
            const org = await db.organization.create({ data: { ...data, type: "COMPANY", parentId: groupOrganizationId, company: { create: { ...profile, groupId } } }, include: { company: true } });
            organizationId = org.id; resource = org.company!;
          }
          break;
        }
        case "organizations": {
          const data = input.organizationInput.parse(raw);
          const parent = await getOrg(data.parentId);
          if (!canNestOrganization(parent.type, data.type)) throw new BusinessError("Invalid organization hierarchy");
          if (recordId) {
            const existing = await getOrg(recordId);
            if (existing.type === "GROUP" || existing.type === "COMPANY") throw new BusinessError("Use the group or company operation");
            if (existing.parentId !== data.parentId || existing.type !== data.type) throw new BusinessError("Changing hierarchy requires a future controlled migration");
            protectCanonicalDivision(existing, data);
            resource = await db.organization.update({ where: { id: recordId }, data });
          } else {
            resource = await db.organization.create({ data: { ...data, department: data.type === "DEPARTMENT" ? { create: {} } : undefined, team: data.type === "TEAM" ? { create: {} } : undefined } });
          }
          organizationId = resource.id;
          break;
        }
        case "relationships": {
          const data = input.relationshipInput.parse(raw);
          const from = await company(data.fromCompanyId); await company(data.toCompanyId);
          if (recordId) {
            const existing = await db.companyRelationship.findUniqueOrThrow({ where: { id: recordId } });
            await company(existing.fromCompanyId); await company(existing.toCompanyId);
          }
          organizationId = from.organizationId;
          resource = recordId ? await db.companyRelationship.update({ where: { id: recordId }, data }) : await db.companyRelationship.create({ data });
          break;
        }
        case "ownership": {
          const parsed = input.ownershipInput.parse(raw);
          const data = { ...parsed, ownerPersonId: parsed.ownerPersonId ?? null, ownerOrgId: parsed.ownerOrgId ?? null };
          const target = await company(data.companyId); organizationId = target.organizationId;
          if (data.ownerOrgId) {
            ctx.requireAccess("organization.read", data.ownerOrgId);
            const org = await db.organization.findUniqueOrThrow({ where: { id: data.ownerOrgId } });
            if (!["GROUP", "COMPANY", "OTHER"].includes(org.type) || org.id === target.organizationId) throw new BusinessError("Ineligible owner entity");
          }
          if (data.ownerPersonId) await personVisible(data.ownerPersonId);
          if (recordId) {
            const existing = await db.ownershipRelationship.findUniqueOrThrow({ where: { id: recordId } });
            await company(existing.companyId);
          }
          resource = recordId ? await db.ownershipRelationship.update({ where: { id: recordId }, data }) : await db.ownershipRelationship.create({ data });
          break;
        }
        case "people": {
          if (recordId) throw new BusinessError("Person identity editing is reserved for a later phase");
          const { organizationId: orgId, ...data } = input.personInput.parse(raw);
          await getOrg(orgId); organizationId = orgId;
          ctx.requireAccess("person.create", organizationId);
          resource = await db.person.create({ data: { ...data, memberships: { create: { organizationId, status: "ACTIVE" } } } });
          const membership = await db.membership.findUniqueOrThrow({ where: { personId_organizationId_scopeKey: { personId: resource.id, organizationId, scopeKey: "organization" } } });
          await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: ctx.user.personId, organizationId, action: "memberships.created", entityType: "memberships", entityId: membership.id, result: "SUCCESS" }) });
          break;
        }
        case "memberships": {
          const data = input.membershipInput.parse(raw);
          await getOrg(data.organizationId); await personVisible(data.personId);
          organizationId = data.organizationId;
          if (recordId) {
            const existing = await db.membership.findUniqueOrThrow({ where: { id: recordId } });
            if (existing.projectId) throw new BusinessError("Use the project membership workspace for project members");
            await getOrg(existing.organizationId);
            if (existing.personId !== data.personId || existing.organizationId !== data.organizationId) throw new BusinessError("Membership identity cannot be changed");
            if (existing.scope !== data.scope) ctx.requireAccess("membership.scope.manage", organizationId);
          }
          if (!recordId && data.scope === "DESCENDANTS") ctx.requireAccess("membership.scope.manage", organizationId);
          if (recordId && data.status === "ACTIVE") await validateMembershipAuthority(db, await createAccessContext(userId, db), recordId, data);
          resource = recordId ? await db.membership.update({ where: { id: recordId }, data }) : await db.membership.create({ data });
          break;
        }
        default: {
          const data = kind === "brands" ? input.brandInput.parse(raw) : input.productInput.parse(raw);
          const org = await getOrg(data.organizationId);
          organizationId = org.id;
          if (!["GROUP", "COMPANY"].includes(org.type)) throw new BusinessError("This resource requires a group or company scope");
          if ("brandId" in data) await linked("brand", data.brandId, org.id);
          if ("divisionId" in data) {
            await validateProductDivision(db, org.id, data.divisionId);
            if (data.divisionId) ctx.requireAccess("organization.read", data.divisionId);
          }
          if (recordId) {
            const existing = kind === "brands" ? await db.brand.findUniqueOrThrow({ where: { id: recordId } }) : await db.product.findUniqueOrThrow({ where: { id: recordId } });
            await getOrg(existing.organizationId);
            if (existing.organizationId !== org.id) throw new BusinessError("Resource organization cannot be changed");
            if (kind === "products" && "divisionId" in existing && existing.slug === "nice-jobs" && org.slug === "aira-skill-city") {
              const division = await db.organization.findUnique({ where: { slug: "aira-career-hub" } });
              if (data.name !== "Nice Jobs" || data.slug !== "nice-jobs" || "divisionId" in data && data.divisionId !== undefined && data.divisionId !== division?.id) throw new BusinessError("Nice Jobs must remain under AIRA Career Hub");
            }
            // Keep referenced children in the same business boundary when editing links.
            if (kind === "products") {
              const update = input.productInput.parse(raw);
              const product = await db.product.findUniqueOrThrow({ where: { id: recordId } });
              const divisionId = update.divisionId === undefined ? product.divisionId : update.divisionId;
              const brandId = update.brandId === undefined ? product.brandId : update.brandId;
              const projects = await boundedRead(take => db.project.findMany({ take, where: { productId: recordId, brandId: { not: null } } }));
              if (projects.some(p => p.brandId !== brandId)) throw new BusinessError("Brand conflicts with a linked project");
              const programs = await boundedRead(take => db.program.findMany({ take, where: { productId: recordId } }));
              if (programs.some(p => divisionId && p.organizationId !== divisionId || p.brandId && p.brandId !== brandId)) throw new BusinessError("Product relationship conflicts with a linked program");
            }
          }
          if (kind === "brands") { const d = input.brandInput.parse(raw); resource = recordId ? await db.brand.update({ where: { id: recordId }, data: d }) : await db.brand.create({ data: d }); }
          else { const d = input.productInput.parse(raw); resource = recordId ? await db.product.update({ where: { id: recordId }, data: d }) : await db.product.create({ data: d }); }
        }
      }
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: ctx.user.personId, organizationId, action: kind + (recordId ? ".updated" : ".created"), entityType: kind, entityId: resource.id, result: "SUCCESS" }) });
      return resource;
    });
  }

  async function personScope(userId: string, personId: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      return boundedRead(take => db.membership.findMany({ take, where: { ...activeMembershipWhere(), personId, organizationId: { in: ctx.ids("membership.read") } }, select: { organizationId: true, scope: true, roles: { take: READ_BUDGET + 1, select: { role: { select: { name: true } } } } } }));
    });
  }
  async function productsForBrand(userId: string, brandId: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      const brand = await db.brand.findUnique({ where: { id: brandId } });
      if (!brand) throw new BusinessError("Brand unavailable");
      ctx.requireAccess("brand.read", brand.organizationId);
      ctx.requireAccess("product.read", brand.organizationId);
      return boundedRead(take => db.product.findMany({ take, where: { brandId, organizationId: brand.organizationId } }));
    });
  }
  async function accessibleCompanies(userId: string) { return list(userId, "companies"); }
  async function assignableRoles(userId: string) {
    return client.$transaction(async db => {
      const ctx = await context(db, userId);
      return boundedRead(take => db.role.findMany({ take, where: { organizationId: { in: ctx.ids("membership.assign_role") }, principalType: "HUMAN", status: "ACTIVE" }, select: { id: true, name: true, organizationId: true } }));
    });
  }
  async function setMembershipRole(userId: string, membershipId: string, roleId: string, enabled: boolean) {
    return client.$transaction(async db => setHumanMembershipRole(db, await createAccessContext(userId, db), membershipId, roleId, enabled));
  }
  return {
    list, save, personScope, productsForBrand, accessibleCompanies, assignableRoles, setMembershipRole,
    companiesForGroup: (userId: string, groupOrganizationId: string) => list(userId, "companies", groupOrganizationId),
    brandsForCompany: (userId: string, companyOrganizationId: string) => list(userId, "brands", companyOrganizationId),
    projectsForCompany: (userId: string, companyOrganizationId: string) => list(userId, "projects", companyOrganizationId),
    peopleForOrganization: (userId: string, organizationId: string) => list(userId, "memberships", organizationId),
    ownershipForCompany: (userId: string, companyOrganizationId: string) => list(userId, "ownership", companyOrganizationId)
  };
}
export const businessService = createBusinessService();
