import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { administrativeOfficerRolePermissions } from "@/server/skillcity/role-templates";
import { createSkillCityAdministrativeDesk } from "@/server/skillcity/administrative-desk";
import { createSkillCityEmployeeDashboard } from "@/server/skillcity/employee-dashboard";
import { createAccessContext } from "@/server/authorization/engine";

const fixture = createPostgresFixture(), db = fixture.db;
let companyId: string, labsId: string, personId: string, userId: string, customerId: string;
const desk = createSkillCityAdministrativeDesk(db), dashboard = createSkillCityEmployeeDashboard(db);

beforeAll(async () => {
  await fixture.initialize(); await db.$transaction(initializeGroupStructure);
  for (const permission of workforcePermissions) await db.permission.upsert({ where: { key: permission.key }, create: permission, update: {} });
  companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  const person = await db.person.create({ data: { displayName: "Synthetic AO" } }); personId = person.id;
  userId = (await db.user.create({ data: { email: `ao-${randomUUID()}@skillcity-test.invalid`, personId, emailVerifiedAt: new Date() } })).id;
  const role = await db.role.create({ data: { organizationId: companyId, key: "aira-administrative-officer", name: "Administrative Officer", permissions: { create: administrativeOfficerRolePermissions.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { organizationId: companyId, personId, scope: "DESCENDANTS", roles: { create: { roleId: role.id } } } });
  const customer = await db.labsBillingCustomer.create({ data: { companyId, customerType: "BUSINESS", legalName: "Synthetic customer", businessName: "Test only", contactPerson: "Original contact", email: "original@customer-test.invalid", phone: "000000", billingAddress: "Synthetic billing address", state: "Karnataka", pinCode: "560001", gstRegistrationStatus: "NOT_CONFIRMED", placeOfSupply: "Karnataka", createdByUserId: userId } }); customerId = customer.id;
  await db.task.create({ data: { organizationId: labsId, assigneePersonId: personId, title: "AO assigned task" } });
  await db.task.create({ data: { organizationId: labsId, title: "Unassigned task must stay hidden" } });
}, 120000);
afterAll(() => fixture.dispose(), 30000);

describe("Skill City Administrative Officer desk", () => {
  it("limits the role to assigned work, scoped status and customer contact maintenance", async () => {
    const result = await dashboard.dashboard(userId, "administrative-officer");
    expect(result.view).toBe("administrative-officer");
    if (result.view !== "administrative-officer") throw new Error("AO view was not returned");
    expect(result.data.tasks.map(task => task.title)).toEqual(["AO assigned task"]);
    expect(result.data.customers.map(customer => customer.id)).toEqual([customerId]);
    expect(result.data.invoices).toEqual([]);
    expect(JSON.stringify(result.data)).not.toContain("bankDetails");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId: companyId });
    for (const forbidden of ["labs.billing.manage", "labs.billing.review", "labs.billing.issue", "labs.billing.payment", "labs.billing.reconcile", "person.read", "membership.manage", "program.manage", "labs.sales.read"]) expect((await ctx.decide(forbidden, { organizationId: labsId })).allowed).toBe(false);
    const updated = await desk.updateCustomerContact(userId, { customerId, version: 0, reference: randomUUID(), contactPerson: "Updated synthetic contact", email: "updated@customer-test.invalid", phone: "111111", billingAddress: "Updated synthetic billing address", pinCode: "560002", notes: "AO contact update" });
    expect(updated).toMatchObject({ contactPerson: "Updated synthetic contact", gstRegistrationStatus: "NOT_CONFIRMED", placeOfSupply: "Karnataka" });
    expect(await db.operationalEvent.count({ where: { eventType: "labs.billing_customer_contact_updated_by_ao", entityId: customerId } })).toBe(1);
    await expect(desk.updateCustomerContact(userId, { customerId, version: 1, reference: randomUUID(), contactPerson: "", email: "", phone: "", billingAddress: "Updated synthetic billing address", pinCode: "560002", notes: "", gstin: "SHOULD_NOT_BE_ACCEPTED" })).rejects.toThrow();
    await expect(desk.updateCustomerContact(userId, { customerId, version: 0, reference: randomUUID(), contactPerson: "Stale write", email: "", phone: "", billingAddress: "Updated synthetic billing address", pinCode: "560002", notes: "" })).rejects.toThrow(/changed/);
  });

  it("rejects a person who is not appointed as the Administrative Officer", async () => {
    const person = await db.person.create({ data: { displayName: "Synthetic unauthorized user" } });
    const outsider = await db.user.create({ data: { email: `outsider-${randomUUID()}@skillcity-test.invalid`, personId: person.id, emailVerifiedAt: new Date() } });
    await expect(desk.workspace(outsider.id)).rejects.toThrow(/unavailable|access denied/i);
  });
});
