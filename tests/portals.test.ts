import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import { initializeGroupStructure } from "@/server/group/structure";
import { hashPassword } from "@/server/auth/password";
import { createAuthenticationService } from "@/server/auth/service";
import { createJobsEmailAuth } from "@/server/auth/jobs-email-auth";
import { createPortalService } from "@/server/portals/service";
import { requirePortalAccess } from "@/server/portals/policy";
import { portalSites, siteByHost, portalHostAllowed, validatePortalOrigin } from "@/server/portals/sites";
import { signPortalContext, verifyPortalContext } from "@/server/portals/context-proof";
import { createSkillCityEmployeeDashboard } from "@/server/skillcity/employee-dashboard";
import { createLabsService } from "@/server/labs/service";

const directory = mkdtempSync(join(tmpdir(), "maxpase-portals-")), file = join(directory, "test.db");
const db = new PrismaClient({ datasourceUrl: "file:" + file.replaceAll("\\", "/") });
const password = randomBytes(24).toString("base64url"), secret = randomBytes(32).toString("base64url");
const auth = createAuthenticationService(db), service = createPortalService(db);
const priorSecret = process.env.AUTH_SECRET;
let userId: string, startupId: string, labsId: string, membershipId: string, labsMembershipId: string, roleId: string;
const credentials = () => ({ email: "portal-member@test.invalid", password });
beforeAll(async () => {
  process.env.AUTH_SECRET = secret;
  const sql = new DatabaseSync(file);
  for (const folder of readdirSync("prisma/migrations").filter(f => /^\d/.test(f)).sort()) sql.exec(readFileSync(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  sql.close(); await db.$transaction(initializeGroupStructure);
  startupId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-startup-school" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  const person = await db.person.create({ data: { displayName: "Portal test member" } });
  userId = (await db.user.create({ data: { email: credentials().email, personId: person.id, passwordHash: await hashPassword(password) } })).id;
  for (const division of [startupId, labsId]) {
    const role = await db.role.create({ data: { organizationId: division, key: "portal-test-member", name: "Portal test member", permissions: { create: await Promise.all(["organization.read", "program.read", "project.read", "task.read", "goal.read"].map(async key => ({ permission: { connect: { id: (await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} })).id } } }))) } } });
    const member = await db.membership.create({ data: { personId: person.id, organizationId: division, roles: { create: { roleId: role.id } } } });
    if (division === startupId) { membershipId = member.id; roleId = role.id; } else labsMembershipId = member.id;
  }
}, 30000);
beforeEach(async () => { await db.securityRateBucket.deleteMany(); });
afterAll(async () => { if (priorSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = priorSecret; await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("Separate brand domains and authenticated gateways", () => {
  it("gates employee views by active role and permission, and isolates advisor and developer work", async () => {
    const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } });
    const foreign = await db.organization.findUniqueOrThrow({ where: { slug: "pearn" } });
    const personId = (await db.user.findUniqueOrThrow({ where: { id: userId } })).personId!;
    const dashboard = createSkillCityEmployeeDashboard(db);
    await expect(dashboard.dashboard(userId, "director")).rejects.toThrow();
    const keys = ["organization.read", "organization.manage", "executive.read", "decision.decide", "labs.sales.self", "labs.sales.perform", "labs.delivery.assignee", "project.read", "task.read", "task.manage"];
    for (const key of keys) await db.permission.upsert({ where: { key }, create: { key, name: key, scope: "GROUP" }, update: {} });
    const companyRole = await db.role.create({ data: { organizationId: company.id, key: "staff-phase3-director", name: "Director", permissions: { create: ["organization.read", "organization.manage", "executive.read", "decision.decide"].map(key => ({ permission: { connect: { key } } })) } } });
    const companyMember = await db.membership.create({ data: { personId, organizationId: company.id, scope: "DESCENDANTS", roles: { create: { roleId: companyRole.id } } } });
    const advisorRole = await db.role.create({ data: { organizationId: labsId, key: "staff-phase3-advisor", name: "Senior Academic Advisor", permissions: { create: ["organization.read", "labs.sales.self", "labs.sales.perform"].map(key => ({ permission: { connect: { key } } })) } } });
    const developerRole = await db.role.create({ data: { organizationId: labsId, key: "staff-phase3-developer", name: "Software Developer", permissions: { create: ["organization.read", "labs.delivery.assignee", "project.read", "task.read", "task.manage"].map(key => ({ permission: { connect: { key } } })) } } });
    const advisorGrant = await db.membershipRole.create({ data: { membershipId: labsMembershipId, roleId: advisorRole.id } });
    const developerGrant = await db.membershipRole.create({ data: { membershipId: labsMembershipId, roleId: developerRole.id } });
    const payload = { company: "Fixture", name: "Contact", email: "contact@fixture.invalid", phone: "", need: "A verified workflow need", source: "MANUAL", consent: true, ownerUserId: userId, nextFollowUp: null, lastContact: null, outcome: "Call pending", qualification: "", quoteId: null, acceptance: "", projectId: null };
    const lead = await db.executiveRecord.create({ data: { kind: "LABS_LEAD", organizationId: labsId, ownerPersonId: personId, title: "Labs assigned lead", status: "NEW", sourceKey: "phase3:labs-lead", payload: JSON.stringify(payload) } });
    const foreignLead = await db.executiveRecord.create({ data: { kind: "LABS_LEAD", organizationId: foreign.id, ownerPersonId: personId, title: "Foreign lead", status: "NEW", sourceKey: "phase3:foreign-lead", payload: JSON.stringify(payload) } });
    const project = await db.project.create({ data: { organizationId: labsId, name: "Assigned Labs project", slug: "phase3-labs-project", ownerPersonId: personId, metadata: JSON.stringify({ kind: "AIRALABS_PROJECT" }) } });
    const foreignProject = await db.project.create({ data: { organizationId: foreign.id, name: "Foreign project", slug: "phase3-foreign-project", ownerPersonId: personId, metadata: JSON.stringify({ kind: "AIRALABS_PROJECT" }) } });
    try {
      const skillLabs = createLabsService(db, () => new Date(), "skillcity");
      const advisor = await dashboard.dashboard(userId, "advisor");
      expect(advisor.view).toBe("advisor");
      expect(advisor.data && "leads" in advisor.data).toBe(true);
      if (advisor.data && "leads" in advisor.data && Array.isArray(advisor.data.leads)) expect(advisor.data.leads.map(row => row.id)).toEqual([lead.id]);
      const developer = await dashboard.dashboard(userId, "developer");
      expect(developer.view).toBe("developer");
      expect(developer.data && "projects" in developer.data).toBe(true);
      if (developer.data && "projects" in developer.data && Array.isArray(developer.data.projects)) expect(developer.data.projects.map(row => row.id)).toEqual([project.id]);
      const director = await dashboard.dashboard(userId, "director");
      expect(director.view).toBe("director");
      expect(director.available).toEqual(["advisor", "director", "developer"]);
      await skillLabs.updateLead(userId, { id: lead.id, version: 0, reference: randomUUID(), status: "CONTACTED", outcome: "Reached the prospect", qualification: "", nextFollowUp: null });
      expect((await db.executiveRecord.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("CONTACTED");
      await expect(skillLabs.updateLead(userId, { id: foreignLead.id, version: 0, reference: randomUUID(), status: "CONTACTED", outcome: "Invalid scope", qualification: "", nextFollowUp: null })).rejects.toThrow();
      await skillLabs.saveTask(userId, { projectId: project.id, title: "Review implementation", description: "Synthetic project notes", dueDate: new Date(Date.now() + 86400000).toISOString(), status: "TODO", reference: randomUUID() });
      expect(await db.task.count({ where: { projectId: project.id, assigneePersonId: personId } })).toBe(1);
      await expect(skillLabs.saveTask(userId, { projectId: foreignProject.id, title: "Forbidden task", description: "", dueDate: new Date(Date.now() + 86400000).toISOString(), status: "TODO", reference: randomUUID() })).rejects.toThrow();
    } finally {
      await db.task.deleteMany({ where: { projectId: project.id } });
      await db.operationalEvent.deleteMany({ where: { entityId: { in: [lead.id, project.id] } } });
      await db.executiveHistory.deleteMany({ where: { recordId: lead.id } });
      await db.project.deleteMany({ where: { id: { in: [project.id, foreignProject.id] } } });
      await db.executiveRecord.deleteMany({ where: { id: { in: [lead.id, foreignLead.id] } } });
      await db.membershipRole.deleteMany({ where: { id: { in: [advisorGrant.id, developerGrant.id] } } });
      await db.membership.delete({ where: { id: companyMember.id } });
      await db.role.deleteMany({ where: { id: { in: [companyRole.id, advisorRole.id, developerRole.id] } } });
    }
  });
  it("rejects every cross-realm session pair across corporate and all four portal audiences", async () => {
    const person = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "organization.read" } });
    const members: string[] = [], roles: string[] = [];
    const realms = [undefined, "skillcity", "startup", "labs", "jobs"] as const;
    const tokens: string[] = [];
    try {
      for (const slug of ["aira-skill-city", "aira-career-hub"]) {
        const org = await db.organization.findUniqueOrThrow({ where: { slug } });
        const role = await db.role.create({ data: { organizationId: org.id, key: "launch-realm-fixture", name: slug === "aira-skill-city" ? "Director" : "Isolated realm fixture", permissions: { create: { permissionId: permission.id } } } });
        roles.push(role.id);
        const member = await db.membership.create({ data: { personId: person.personId!, organizationId: org.id, roles: { create: { roleId: role.id } } } });
        members.push(member.id);
      }
      for (const realm of realms) {
        if (realm === "jobs") {
          let code = "";
          const emailAuth = createJobsEmailAuth(db, { env: { NICEJOBS_EMAIL_AUTH_ENABLED: "true", RESEND_API_KEY: "isolated-test-key", NICEJOBS_AUTH_FROM: "auth@test.invalid", NICEJOBS_OTP_SECRET: secret }, send: async message => { code = message.code; return "isolated-receipt"; } });
          const proof = await emailAuth.beginLogin(credentials());
          tokens.push((await emailAuth.completeLogin({ ...proof, code }, secret)).token);
        } else tokens.push((await auth.create(userId, secret, undefined, 300000, realm)).token);
      }
      for (const [i, source] of realms.entries()) {
        for (const [j, target] of realms.entries()) {
          if (i === j) expect(await auth.validate(tokens[i], secret, target)).toMatchObject({ userId });
          else {
            expect(await auth.validate(tokens[i], secret, target)).toBeNull();
            await auth.revoke(tokens[i], secret, target);
            expect(await auth.validate(tokens[i], secret, source)).not.toBeNull();
          }
        }
      }
    } finally {
      for (const [i, realm] of realms.entries()) if (tokens[i]) await auth.revoke(tokens[i], secret, realm);
      await db.membership.deleteMany({ where: { id: { in: members } } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
    }
  });
  it("keeps MAXPASE routing separate and requires company authority for Skill City", async () => {
    const group = await middleware(new NextRequest("https://maxpase.com/", { headers: { host: "maxpase.com" } }));
    expect(group.headers.get("x-middleware-rewrite")).toBeNull();
    expect(group.headers.get("x-middleware-request-x-maxpase-portal")).toBeNull();
    expect((await middleware(new NextRequest("https://maxpase.com/app/boss", { headers: { host: "maxpase.com" } }))).headers.get("location")).toBe("https://maxpase.com/login");
    expect(await auth.loginPortal(credentials(), secret, "skillcity")).toBeNull();
    const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "organization.read" } });
    const person = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const role = await db.role.create({ data: { organizationId: company.id, key: "skillcity-test", name: "Director", permissions: { create: { permissionId: permission.id } } } });
    const member = await db.membership.create({ data: { personId: person.personId!, organizationId: company.id, roles: { create: { roleId: role.id } } } });
    try {
      const session = await auth.loginPortal(credentials(), secret, "skillcity"); expect(session).not.toBeNull();
      for (const realm of [undefined, "startup", "labs", "jobs"] as const) expect(await auth.validate(session!.token, secret, realm)).toBeNull();
      expect((await requirePortalAccess(db, userId, "skillcity")).companyId).toBe(company.id);
      const programs = (await service.dashboard(userId, "skillcity", "programs")).programs;
      expect(programs).toEqual([]);
      await db.membership.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      await expect(requirePortalAccess(db, userId, "skillcity")).rejects.toThrow();
      await auth.revoke(session!.token, secret, "skillcity");
    } finally { await db.membership.delete({ where: { id: member.id } }); await db.role.delete({ where: { id: role.id } }); }
  });
  it("maps only exact canonical/www hosts and rejects suffixes, paths and forwarded-host tricks", async () => {
    for (const site of portalSites) {
      expect(siteByHost(site.domain)?.id).toBe(site.id); expect(siteByHost("www." + site.domain)?.id).toBe(site.id);
      expect(siteByHost(site.domain.toUpperCase() + ":443")?.id).toBe(site.id);
      expect(siteByHost(site.domain + ".attacker.invalid")).toBeUndefined(); expect(siteByHost(site.domain + "/path")).toBeUndefined();
    }
    const request = new NextRequest("http://localhost:3000/", { headers: { host: "localhost:3000", "x-forwarded-host": "airalabs.online" } });
    expect((await middleware(request)).headers.get("x-middleware-rewrite")).toBeNull();
    const spoofed = await middleware(new NextRequest("http://localhost:3000/sites/startup/login", { headers: { host: "localhost:3000", "x-forwarded-host": "airastartupskool.com", "x-maxpase-portal": "startup" } }));
    expect(spoofed.headers.get("x-middleware-request-x-forwarded-host")).toBe("localhost:3000");
    expect(spoofed.headers.get("x-middleware-request-x-maxpase-portal")).toBeNull();
  });
  it("rewrites domain landing/login/gateway paths without dropping query and blocks corporate routes", async () => {
    for (const site of portalSites) {
      for (const path of ["/", "/login", "/gateway?view=tasks"]) {
        const r = await middleware(new NextRequest("https://" + site.domain + path, { headers: { host: site.domain, cookie: site.cookie + "=candidate" } }));
        expect(r.headers.get("x-middleware-rewrite")).toContain(`/sites/${site.id}`);
        expect(r.headers.get("x-middleware-request-x-maxpase-portal")).toBe(site.id);
        expect(r.headers.get("x-middleware-request-x-forwarded-host")).toBe(site.domain);
        if (path.includes("?")) expect(r.headers.get("x-middleware-rewrite")).toContain("?view=tasks");
      }
      expect((await middleware(new NextRequest("https://" + site.domain + "/app/boss", { headers: { host: site.domain } }))).status).toBe(404);
      expect((await middleware(new NextRequest("https://" + site.domain + "/sites/labs", { headers: { host: site.domain } }))).status).toBe(404);
      expect((await middleware(new NextRequest("https://" + site.domain + "/gateway", { headers: { host: site.domain } }))).headers.get("location")).toBe("https://" + site.domain + "/login");
      const opportunities = await middleware(new NextRequest("https://" + site.domain + "/opportunities", { headers: { host: site.domain } }));
      expect(site.id === "jobs" ? opportunities.headers.get("x-middleware-rewrite") : opportunities.status).toBe(site.id === "jobs" ? "https://nicejobs.online/sites/jobs/opportunities" : 404);
      const reset = await middleware(new NextRequest("https://" + site.domain + "/reset-password", { headers: { host: site.domain } }));
      expect(site.id === "jobs" ? reset.headers.get("x-middleware-rewrite") : reset.status).toBe(site.id === "jobs" ? "https://nicejobs.online/sites/jobs/reset-password" : 404);
      const offer = await middleware(new NextRequest("https://" + site.domain + "/offers/12345678-1234-1234-1234-123456789012", { headers: { host: site.domain } }));
      expect(site.id === "jobs" ? offer.headers.get("x-middleware-rewrite") : offer.status).toBe(site.id === "jobs" ? "https://nicejobs.online/sites/jobs/offers/12345678-1234-1234-1234-123456789012" : 404);
    }
  });
  it("preserves authenticated internal forwarding context but rejects forged, tampered and expired envelopes", async () => {
    const site = portalSites[0], proof = await signPortalContext(site, site.domain, secret);
    expect((await verifyPortalContext(proof, secret))?.site.id).toBe(site.id);
    expect(await verifyPortalContext(proof, randomBytes(32).toString("hex"))).toBeNull();
    expect(await verifyPortalContext(proof, secret, Date.now() + 121000)).toBeNull();
    const parts = proof.split("."); const modified = btoa(JSON.stringify({ id: "labs", host: "airalabs.online", time: Date.now() })) + "." + parts[1];
    expect(await verifyPortalContext(modified, secret)).toBeNull();
    const forwarded = await middleware(new NextRequest("http://localhost:3000/sites/startup/login", { headers: { host: "localhost:3000", "x-maxpase-portal-context": proof } }));
    expect(forwarded.headers.get("x-middleware-request-x-maxpase-portal-context")).toBe(proof);
    expect(forwarded.headers.get("x-middleware-request-x-forwarded-host")).toBe(site.domain);
    const invalid = await middleware(new NextRequest("http://localhost:3000/sites/startup/login", { headers: { host: "localhost:3000", "x-maxpase-portal-context": modified } }));
    expect(invalid.headers.get("x-middleware-request-x-maxpase-portal-context")).toBeNull();
  });
  it("enforces HTTPS and exact same-site mutation origin; local previews exist only outside production", () => {
    for (const site of portalSites) {
      expect(() => validatePortalOrigin(site, site.domain, "https://" + site.domain, false)).not.toThrow();
      expect(() => validatePortalOrigin(site, site.domain, "http://" + site.domain, false)).toThrow();
      expect(() => validatePortalOrigin(site, site.domain, "https://attacker.invalid", false)).toThrow();
      expect(() => validatePortalOrigin(site, site.domain, null, false)).toThrow();
      expect(portalHostAllowed(site, "localhost:3000", false)).toBe(false);
      expect(() => validatePortalOrigin(site, "localhost:3000", "http://localhost:3000", true)).not.toThrow();
      expect(portalHostAllowed(site, portalSites.find(s => s.id !== site.id)!.domain, false)).toBe(false);
    }
  });
  it("verifies credentials and binds sessions to one brand, never accepting group or sibling tokens", async () => {
    const login = await auth.loginPortal(credentials(), secret, "startup"); expect(!!login).toBe(true);
    expect(await auth.validate(login!.token, secret, "startup")).toMatchObject({ userId });
    expect(await auth.validate(login!.token, secret, "labs")).toBeNull(); expect(await auth.validate(login!.token, secret)).toBeNull();
    const group = await auth.login(credentials(), secret); expect(await auth.validate(group!.token, secret, "startup")).toBeNull();
    expect(await auth.loginPortal({ ...credentials(), password: randomBytes(20).toString("hex") }, secret, "startup")).toBeNull();
    expect((await db.auditEvent.findFirst({ where: { actorUserId: userId, action: "auth.login", organizationId: startupId } }))?.result).toBe("SUCCESS");
  });
  it("requires current membership/permission and denies a valid password on an unauthorized gateway", async () => {
    const count = await db.session.count(); expect(await auth.loginPortal(credentials(), secret, "jobs")).toBeNull(); expect(await db.session.count()).toBe(count);
    const login = await auth.loginPortal(credentials(), secret, "startup");
    await db.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } });
    try { expect(await auth.validate(login!.token, secret, "startup")).not.toBeNull(); await expect(requirePortalAccess(db, userId, "startup")).rejects.toThrow(); await expect(service.dashboard(userId, "startup")).rejects.toThrow(); }
    finally { await db.membership.update({ where: { id: membershipId }, data: { status: "ACTIVE" } }); }
  });
  it("keeps concurrent brand sessions separate and revokes only the matching brand session", async () => {
    const startup = await auth.loginPortal(credentials(), secret, "startup"), labs = await auth.loginPortal(credentials(), secret, "labs");
    await auth.revoke(startup!.token, secret, "labs"); expect(await auth.validate(startup!.token, secret, "startup")).not.toBeNull();
    await auth.revoke(startup!.token, secret, "startup"); expect(await auth.validate(startup!.token, secret, "startup")).toBeNull(); expect(await auth.validate(labs!.token, secret, "labs")).not.toBeNull();
  });
  it("returns only authorized division work/programs, never sibling content or sensitive raw records", async () => {
    await db.task.create({ data: { organizationId: startupId, title: "Startup authorized work", description: "Internal metadata not displayed" } });
    await db.task.create({ data: { organizationId: labsId, title: "Labs private work" } });
    const companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
    await db.program.create({ data: { companyOrganizationId: companyId, organizationId: startupId, name: "Startup authorized program", slug: "portal-startup-program" } });
    await db.program.create({ data: { companyOrganizationId: companyId, organizationId: labsId, name: "Labs private program", slug: "portal-labs-program" } });
    const data = await service.dashboard(userId, "startup");
    expect(data.records.map(r => r.title)).toEqual(["Startup authorized work"]); expect(data.programs.map(p => p.name)).toEqual(["Startup authorized program"]);
    expect(JSON.stringify(data)).not.toContain("Labs private"); expect(JSON.stringify(data)).not.toContain("Internal metadata");
    const permission = await db.permission.findUniqueOrThrow({ where: { key: "task.read" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId: permission.id } } });
    try { expect((await service.dashboard(userId, "startup")).records).toEqual([]); }
    finally { await db.rolePermission.create({ data: { roleId, permissionId: permission.id } }); }
  });
  it("denies inactive company/division lifecycle and compromised canonical company relationships", async () => {
    await db.organization.update({ where: { id: labsId }, data: { status: "SUSPENDED" } });
    try { await expect(requirePortalAccess(db, userId, "labs")).rejects.toThrow(); }
    finally { await db.organization.update({ where: { id: labsId }, data: { status: "ACTIVE" } }); }
    const companyId = (await db.organization.findUniqueOrThrow({ where: { id: labsId } })).parentId;
    const other = await db.organization.create({ data: { name: "Foreign test company", slug: "portal-foreign", type: "COMPANY" } });
    await db.organization.update({ where: { id: labsId }, data: { parentId: other.id } });
    try { await expect(requirePortalAccess(db, userId, "labs")).rejects.toThrow(); }
    finally { await db.organization.update({ where: { id: labsId }, data: { parentId: companyId } }); }
    expect((await db.membership.findUniqueOrThrow({ where: { id: labsMembershipId } })).status).toBe("ACTIVE");
  });
  it("rolls back brand session issuance if mandatory audit insertion fails", async () => {
    const sql = new DatabaseSync(file); sql.exec("CREATE TRIGGER PortalAuditFailure BEFORE INSERT ON AuditEvent WHEN NEW.action = 'auth.login' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    const count = await db.session.count();
    try { await expect(auth.loginPortal(credentials(), secret, "startup")).rejects.toThrow(); expect(await db.session.count()).toBe(count); }
    finally { sql.exec("DROP TRIGGER PortalAuditFailure"); sql.close(); }
  });
});
