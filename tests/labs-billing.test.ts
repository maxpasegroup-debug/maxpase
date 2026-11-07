import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { initializeGroupStructure } from "@/server/group/structure";
import { workforcePermissions } from "@/server/authorization/registry";
import { createLabsService } from "@/server/labs/service";
import { createLabsBillingOperations } from "@/server/labs/billing-operations";
import { createOperationsService } from "@/server/domain/operations-service";
import { buildInvoicePdf } from "@/server/labs/invoice-pdf";
import { buildQuotationPdf } from "@/server/labs/quotation-pdf";

const fixture = createPostgresFixture(), db = fixture.db;
let companyId: string, labsId: string, founderId: string, reviewerId: string;
const registeredPermissions = workforcePermissions.filter(permission => permission.key.startsWith("labs."));
const allKeys = ["organization.read", "person.read", "request.read", "request.manage", "approval.read", "approval.decide", "control.read", "control.manage", "notification.read", "notification.generate", "operations.process", "event.read", ...registeredPermissions.map(permission => permission.key)];

async function user(label: string) {
  const person = await db.person.create({ data: { displayName: `Synthetic ${label}` } });
  const account = await db.user.create({ data: { email: `${label}-${randomUUID()}@labs-billing-test.invalid`, personId: person.id, emailVerifiedAt: new Date() } });
  const role = await db.role.create({ data: { organizationId: labsId, key: randomUUID(), name: `Synthetic ${label}`, permissions: { create: allKeys.map(key => ({ permission: { connect: { key } } })) } } });
  await db.membership.create({ data: { organizationId: labsId, personId: person.id, roles: { create: { roleId: role.id } } } });
  return account.id;
}

beforeAll(async () => {
  await fixture.initialize();
  await db.$transaction(initializeGroupStructure);
  for (const permission of workforcePermissions) await db.permission.upsert({ where: { key: permission.key }, create: permission, update: {} });
  companyId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } })).id;
  labsId = (await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } })).id;
  founderId = await user("billing-founder"); reviewerId = await user("billing-reviewer");
}, 120000);
afterAll(() => fixture.dispose(), 30000);

describe("AIRA Skill City billing first-invoice path", () => {
  it("runs the synthetic quote, independent approval, acceptance, invoice PDF and payment reconciliation flow", async () => {
    const billing = createLabsBillingOperations(db);
    const sales = createLabsService(db, () => new Date(), "labs");
    const operations = createOperationsService(db);
    const canonical = await db.companyProfile.findUniqueOrThrow({ where: { organizationId: companyId } });
    const legalName = canonical.legalName ?? "AIRA SKILL CITY PRIVATE LIMITED";
    const state = "Karnataka";
    await db.companyProfile.update({ where: { id: canonical.id }, data: { legalName, metadata: JSON.stringify({ legalInformationVerified: true, legalVerificationEvidence: "Synthetic isolated test fixture; not real evidence" }) } });
    await db.labsBillingProfile.create({ data: { companyId, legalName, registeredAddress: "Synthetic registered address for isolated testing", registeredState: state, gstin: "29ABCDE1234F1Z5", gstRegistrationStatus: "REGISTERED", financialYear: "2026-27", authorizedSignatory: "Synthetic signatory", bankDetails: JSON.stringify({ bankName: "Synthetic Bank", accountHolder: legalName, accountNumber: "SYNTHETIC", ifsc: "SYNTHETIC", branch: "Test" }), profileStatus: "APPROVED_FOR_BILLING", taxReviewStatus: "APPROVED", approvedTaxBasisPoints: JSON.stringify([1800]), eInvoiceStatus: "NOT_APPLICABLE", legalVerifiedAt: new Date(), legalVerifiedByUserId: reviewerId, caReviewedAt: new Date(), caReviewedByUserId: reviewerId, verificationEvidence: "Synthetic isolated test fixture", taxReviewEvidence: "Synthetic isolated test fixture" } });
    const issuer = { companyId, legalName, address: "Synthetic registered address for isolated testing", taxRegistration: "29ABCDE1234F1Z5", verificationEvidence: "Synthetic isolated test fixture", authorizedByUserId: reviewerId, allowedTaxBasisPoints: [1800] };
    await db.systemConfiguration.upsert({ where: { key: "AIRALABS_BILLING" }, create: { key: "AIRALABS_BILLING", value: JSON.stringify(issuer) }, update: { value: JSON.stringify(issuer) } });
    const serviceDraft = await billing.createService(founderId, { category: "AI_AUTOMATION", name: `Synthetic automation ${randomUUID()}`, description: "Synthetic business workflow automation service for isolated testing", scope: "Synthetic test scope", deliverables: "Synthetic test deliverables", pricingBasis: "FIXED", defaultPrice: "100.00", sacCode: "SYNTHETIC", placeOfSupplyRule: "Synthetic CA-reviewed test rule" });
    const service = await billing.approveServiceTax(reviewerId, { serviceId: serviceDraft.id, gstBasisPoints: 1800, sacCode: "SYNTHETIC-SAC", evidence: "Synthetic isolated tax review evidence" });
    const customer = await billing.createCustomer(founderId, { customerType: "BUSINESS", legalName: `Synthetic customer ${randomUUID()}`, businessName: "Synthetic testing only", contactPerson: "Test Contact", email: "billing-test@example.invalid", phone: "", billingAddress: "Synthetic billing address for isolated testing", state, pinCode: "000000", gstRegistrationStatus: "UNREGISTERED", gstin: "", placeOfSupply: state, notes: "Synthetic isolated fixture" });

    const lead = await sales.createLead(founderId, { company: customer.legalName, name: "Synthetic contact", email: `lead-${randomUUID()}@example.invalid`, phone: "", need: "Synthetic end-to-end invoice test requirements", source: "MANUAL", consent: true });
    await sales.updateLead(founderId, { id: lead.id, version: 0, reference: randomUUID(), status: "CONTACTED", outcome: "Synthetic test contact", qualification: "", nextFollowUp: null });
    await sales.updateLead(founderId, { id: lead.id, version: 1, reference: randomUUID(), status: "QUALIFIED", outcome: "Synthetic test qualification", qualification: "Synthetic verified test requirements", nextFollowUp: null });
    const control = await operations.saveControl(founderId, { organizationId: labsId, name: `Synthetic quotation review ${randomUUID()}`, kind: "APPROVAL", requiredPermission: "labs.quote.issue", allowSelfApproval: false, stages: [[{ approverUserId: reviewerId, requiredPermission: "labs.quote.issue" }]] });
    await db.systemConfiguration.upsert({ where: { key: "AIRALABS_QUOTE_CONTROL" }, create: { key: "AIRALABS_QUOTE_CONTROL", value: JSON.stringify({ controlPointId: control.id }) }, update: { value: JSON.stringify({ controlPointId: control.id }) } });
    const quoteDraft = await sales.quote(founderId, { leadId: lead.id, serviceId: service.id, currency: "INR", items: [{ description: service.name, quantity: "1", rate: "100.00" }], discount: "0", taxBasisPoints: 1800, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, randomUUID());
    const qdoc = await sales.quoteDocument(founderId, quoteDraft.id);
    expect(buildQuotationPdf(qdoc).subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    await sales.submitQuote(founderId, { id: quoteDraft.id, version: quoteDraft.version, reference: randomUUID() });
    await sales.decideQuote(reviewerId, quoteDraft.id, "APPROVED", "Synthetic independent review");
    await sales.issue(founderId, { id: quoteDraft.id, version: 1, reference: randomUUID() });
    await sales.accept(founderId, { id: quoteDraft.id, version: 2, reference: randomUUID(), evidence: "Synthetic customer acceptance evidence" });

    const invoice = await billing.createInvoiceFromQuote(founderId, { quoteId: quoteDraft.id, customerId: customer.id, serviceIds: [service.id], dueDate: null });
    expect(invoice.invoiceNumber).toMatch(/^ASK\/INV\/2026-27\/0001$/);
    const document = await billing.invoiceDocument(founderId, invoice.id);
    expect(document.calculation).toMatchObject({ cgst: "9.00", sgst: "9.00", igst: "0.00", total: "118.00" });
    const pdf = buildInvoicePdf(document);
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(pdf.toString("ascii")).toContain("ASK/INV/2026-27/0001");
    const payment = await billing.recordPayment(founderId, { invoiceId: invoice.id, paymentDate: new Date().toISOString(), amount: "118.00", paymentMode: "BANK_TRANSFER", bankReference: "SYNTHETIC-REF", notes: "Synthetic test only" });
    expect((await billing.list(founderId)).invoices[0].paymentStatus).toBe("UNPAID");
    await billing.verifyPayment(reviewerId, payment.id, "Synthetic independent bank reconciliation evidence");
    const updated = await billing.list(founderId);
    expect(updated.invoices.find(row => row.id === invoice.id)).toMatchObject({ paymentStatus: "PAID", receivedAmount: "118.00", outstandingAmount: "0.00" });
    expect(await db.auditEvent.count({ where: { organizationId: companyId, entityType: { in: ["LabsBillingInvoice", "LabsBillingPayment"] } } })).toBeGreaterThanOrEqual(2);
  }, 60000);

});
