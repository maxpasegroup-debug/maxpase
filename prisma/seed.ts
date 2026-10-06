import { PrismaClient, PermissionScope } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/auth/password";
import { canonicalAiraRoles } from "../src/server/domain/aira-roles";
import { workforcePermissions } from "../src/server/authorization/registry";
import { seedAiraStructure } from "../src/server/domain/aira-seed";
import { initializeGroupStructure } from "../src/server/group/structure";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production");
  const groupOrg = await prisma.organization.upsert({
    where: { slug: "maxpase-group" },
    update: {},
    create: {
      type: "GROUP",
      name: "MAXPASE GROUP",
      slug: "maxpase-group",
      description: "Parent business ecosystem for MAXPASE OS.",
      group: {
        create: {
          name: "MAXPASE GROUP",
          description: "Group-level root for MAXPASE OS."
        }
      }
    },
    include: { group: true }
  });

  if (!groupOrg.group) {
    throw new Error("MAXPASE group profile was not created.");
  }

  const aira = await prisma.organization.upsert({
    where: { slug: "aira-skill-city" },
    update: {},
    create: {
      type: "COMPANY",
      name: "AIRA SKILL CITY PRIVATE LIMITED",
      slug: "aira-skill-city",
      parentId: groupOrg.id,
      metadata: JSON.stringify({ developmentSeed: true }),
      company: { create: {
        groupId: groupOrg.group.id,
        legalName: "AIRA SKILL CITY PRIVATE LIMITED",
        displayName: "AIRA Skill City",
        metadata: JSON.stringify({ developmentSeed: true, legalInformationVerified: false })
      } }
    }
  });

  await prisma.$transaction(db => seedAiraStructure(db, aira.id));
  await prisma.$transaction(initializeGroupStructure);
  const department = await prisma.organization.upsert({
    where: { slug: "aira-development-administration" }, update: {},
    create: { type: "DEPARTMENT", name: "Development administration", slug: "aira-development-administration", parentId: aira.id, description: "Development example only; not a claim about AIRA's real organization.", metadata: JSON.stringify({ developmentSeed: true }), department: { create: {} } }
  });
  await prisma.organization.upsert({
    where: { slug: "aira-development-workspace" }, update: {},
    create: { type: "TEAM", name: "Development workspace", slug: "aira-development-workspace", parentId: department.id, description: "Unstaffed development example.", metadata: JSON.stringify({ developmentSeed: true }), team: { create: {} } }
  });
  for (const definition of canonicalAiraRoles) {
    await prisma.role.upsert({ where: { organizationId_key: { organizationId: aira.id, key: definition.key } }, update: definition, create: { ...definition, organizationId: aira.id } });
  }
  for (const definition of workforcePermissions) {
    await prisma.permission.upsert({ where: { key: definition.key }, update: definition, create: definition });
  }

  const permissions = [
    ["system.admin", "System administration", PermissionScope.GLOBAL],
    ["organization.read", "Read organization structure", PermissionScope.GROUP],
    ["organization.manage", "Manage organization structure", PermissionScope.GROUP],
    ["company.read", "Read company information", PermissionScope.COMPANY],
    ["company.manage", "Manage company foundation", PermissionScope.COMPANY],
    ["audit.read", "Read audit events", PermissionScope.GROUP],
    ["sia.approve_action", "Approve high-impact SIA actions", PermissionScope.GROUP],
    ["membership.scope.manage", "Manage membership authorization scope", PermissionScope.GROUP],
    ["membership.assign_role", "Assign scoped membership roles", PermissionScope.GROUP],
    ...["membership", "ownership", "brand", "product", "project", "goal"].flatMap(domain => [
      [domain + ".read", "Read " + domain, PermissionScope.GROUP],
      [domain + ".manage", "Manage " + domain, PermissionScope.GROUP]
    ] as const)
  ] as const;

  for (const [key, name, scope] of permissions) {
    await prisma.permission.upsert({
      where: { key },
      update: { name, scope },
      create: { key, name, scope }
    });
  }

  const role = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: groupOrg.id, key: "group-architect" } },
    update: {},
    create: {
      organizationId: groupOrg.id,
      key: "group-architect",
      name: "Group Architect",
      description: "Foundational administrative role for Phase 01.",
      system: true
    }
  });

  const allPermissions = await prisma.permission.findMany();
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
  }

  const person = await prisma.person.upsert({
    where: { email: "admin@maxpase.local" },
    update: {},
    create: {
      displayName: "MAXPASE Admin",
      email: "admin@maxpase.local"
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@maxpase.local" },
    update: {},
    create: {
      email: "admin@maxpase.local",
      passwordHash: await hashPassword(process.env.DEV_BOOTSTRAP_PASSWORD ?? randomBytes(32).toString("base64url")),
      personId: person.id
    }
  });

  const membership = await prisma.membership.upsert({
    where: { personId_organizationId_scopeKey: { personId: person.id, organizationId: groupOrg.id, scopeKey: "organization" } },
    update: { scope: "DESCENDANTS" },
    create: { personId: person.id, organizationId: groupOrg.id, title: "Development Administrator", scope: "DESCENDANTS" }
  });

  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
    update: {},
    create: { membershipId: membership.id, roleId: role.id }
  });

  await prisma.siaIdentity.upsert({
    where: { id: "sia-default" },
    update: {},
    create: {
      id: "sia-default",
      name: "SIA",
      title: "MAXPASE GROUP Virtual CEO"
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
