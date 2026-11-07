import { z } from "zod";
import { prisma } from "@/server/db";
import { requirePortalAccess } from "@/server/portals/policy";
import { AccessError } from "@/server/authorization/engine";
import type { Prisma, PrismaClient } from "@prisma/client";
import { quotePayload, leadPayload, billingConfig } from "./input";

const decimal = z.string().regex(/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/);
const customerInput = z.object({ customerType: z.enum(["INDIVIDUAL", "BUSINESS"]), legalName: z.string().trim().min(1).max(200), businessName: z.string().trim().max(200).default(""), contactPerson: z.string().trim().max(160).default(""), email: z.string().trim().email().max(254).or(z.literal("")).default(""), phone: z.string().trim().max(30).default(""), billingAddress: z.string().trim().min(5).max(1000), state: z.string().trim().min(2).max(100), pinCode: z.string().trim().regex(/^[0-9]{6}$/), gstRegistrationStatus: z.enum(["REGISTERED", "UNREGISTERED", "NOT_CONFIRMED"]), gstin: z.string().trim().toUpperCase().max(15).default(""), placeOfSupply: z.string().trim().min(2).max(100), notes: z.string().trim().max(2000).default("") }).strict();
const serviceInput = z.object({ category: z.enum(["AI_AUTOMATION", "BUSINESS_PROCESS_AUTOMATION", "WORKFLOW_AUTOMATION", "WHATSAPP_AUTOMATION", "CRM_AUTOMATION", "AI_AGENT_DEVELOPMENT", "CUSTOM_SOFTWARE_INTEGRATION", "MAINTENANCE_SUPPORT", "OTHER_APPROVED"]), name: z.string().trim().min(2).max(160), description: z.string().trim().min(5).max(1000), scope: z.string().trim().max(3000).default(""), deliverables: z.string().trim().max(3000).default(""), pricingBasis: z.enum(["FIXED", "HOURLY", "MONTHLY", "MILESTONE"]), defaultPrice: decimal.or(z.literal("")).default(""), sacCode: z.string().trim().max(20).default(""), placeOfSupplyRule: z.string().trim().max(1000).default(""), version: z.number().int().min(0).default(0) }).strict();
const paymentInput = z.object({ invoiceId: z.string().min(1).max(200), paymentDate: z.string().datetime(), amount: decimal, paymentMode: z.enum(["BANK_TRANSFER", "UPI", "CARD", "CASH", "CHEQUE", "OTHER"]), bankReference: z.string().trim().max(160).default(""), notes: z.string().trim().max(1000).default("") }).strict();
const vendorBillInput = z.object({ vendorName: z.string().trim().min(1).max(200), vendorGstin: z.string().trim().toUpperCase().max(15).default(""), vendorInvoiceNumber: z.string().trim().min(1).max(100), billDate: z.string().datetime(), description: z.string().trim().min(3).max(1000), expenseCategory: z.string().trim().min(2).max(100), taxableAmount: decimal, cgst: decimal.default("0"), sgst: decimal.default("0"), igst: decimal.default("0"), dueDate: z.string().datetime().nullable() }).strict();
const moneyPaise = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); };
const formatMoney = (paise: bigint) => `${paise / 100n}.${(paise % 100n).toString().padStart(2, "0")}`;
const fingerprintJson = (value: unknown) => JSON.stringify(value);
const fiscalYear = (date: Date) => { const start = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${start}-${String((start + 1) % 100).padStart(2, "0")}`; };
const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const gstStateCodes: Record<string, string> = { "JAMMU AND KASHMIR":"01", "HIMACHAL PRADESH":"02", PUNJAB:"03", CHANDIGARH:"04", UTTARAKHAND:"05", HARYANA:"06", DELHI:"07", RAJASTHAN:"08", "UTTAR PRADESH":"09", BIHAR:"10", SIKKIM:"11", "ARUNACHAL PRADESH":"12", NAGALAND:"13", MANIPUR:"14", MIZORAM:"15", TRIPURA:"16", MEGHALAYA:"17", ASSAM:"18", "WEST BENGAL":"19", JHARKHAND:"20", ODISHA:"21", CHHATTISGARH:"22", "MADHYA PRADESH":"23", GUJARAT:"24", "DADRA AND NAGAR HAVELI AND DAMAN AND DIU":"26", MAHARASHTRA:"27", KARNATAKA:"29", GOA:"30", LAKSHADWEEP:"31", KERALA:"32", "TAMIL NADU":"33", PUDUCHERRY:"34", "ANDAMAN AND NICOBAR ISLANDS":"35", TELANGANA:"36", "ANDHRA PRADESH":"37", LADAKH:"38" };
const stateCode = (value: string) => gstStateCodes[value.trim().toLocaleUpperCase("en-IN").replace(/\s+/g, " ")];

async function scope(client: PrismaClient, userId: string, permission: string) {
  const access = await requirePortalAccess(client, userId, "labs");
  await access.ctx.requireAccess(permission, { organizationId: access.divisionId });
  const company = await client.organization.findUnique({ where: { id: access.companyId }, select: { id: true, slug: true, company: { select: { legalName: true, status: true, metadata: true } } } });
  if (!company || company.slug !== "aira-skill-city" || company.company?.status !== "ACTIVE") throw new AccessError("AIRA Skill City company scope unavailable");
  return { access, company };
}

async function audit(db: Prisma.TransactionClient | typeof prisma, userId: string, companyId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  const actor = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
  await db.auditEvent.create({ data: { actorUserId: userId, actorPersonId: actor.personId, organizationId: companyId, action, entityType, entityId, result: "SUCCESS", metadata: JSON.stringify(metadata) } });
}

export function createLabsBillingOperations(client: PrismaClient = prisma) {
  return {
  async list(userId: string) {
    const { company, access } = await scope(client,userId, "labs.billing.read");
    const [profile, customers, services, invoices, vendorBills, canManage, canReview, canIssue, canPayment, canReconcile, canVendor] = await Promise.all([
      client.labsBillingProfile.findUnique({ where: { companyId: company.id } }),
      client.labsBillingCustomer.findMany({ where: { companyId: company.id, active: true }, orderBy: [{ legalName: "asc" }, { id: "asc" }], take: 200 }),
      client.labsBillingService.findMany({ where: { companyId: company.id }, orderBy: [{ category: "asc" }, { name: "asc" }], take: 200 }),
      client.labsBillingInvoice.findMany({ where: { companyId: company.id }, include: { payments: { orderBy: { paymentDate: "asc" } } }, orderBy: { issueDate: "desc" }, take: 500 }),
      client.labsVendorBill.findMany({ where: { companyId: company.id }, include: { evidence: { orderBy: { createdAt: "asc" } } }, orderBy: { billDate: "desc" }, take: 500 }),
      access.ctx.decide("labs.billing.manage", { organizationId: access.divisionId }), access.ctx.decide("labs.billing.review", { organizationId: access.divisionId }), access.ctx.decide("labs.billing.issue", { organizationId: access.divisionId }), access.ctx.decide("labs.billing.payment", { organizationId: access.divisionId }), access.ctx.decide("labs.billing.reconcile", { organizationId: access.divisionId }), access.ctx.decide("labs.billing.vendor", { organizationId: access.divisionId }),
    ]);
    const invoiceRows = invoices.map(invoice => {
      const received = invoice.payments.filter(payment => payment.verificationStatus === "VERIFIED").reduce((sum, payment) => sum + moneyPaise(payment.amount), 0n);
      const total = moneyPaise(invoice.totalAmount);
      const overdue = invoice.status === "ISSUED" && invoice.dueDate !== null && invoice.dueDate < new Date() && received < total;
      return { ...invoice, receivedAmount: formatMoney(received), outstandingAmount: formatMoney(total > received ? total - received : 0n), paymentStatus: invoice.status === "CANCELLED" ? "CANCELLED" : received >= total ? "PAID" : received > 0n ? "PARTIALLY_PAID" : overdue ? "OVERDUE" : "UNPAID" };
    });
    return { companyId: company.id, divisionId: access.divisionId, profile: profile ? { ...profile, bankDetails: canManage.allowed ? profile.bankDetails : null } : null, customers, services, invoices: invoiceRows, vendorBills, capabilities: { manage: canManage.allowed, review: canReview.allowed, issue: canIssue.allowed, payment: canPayment.allowed, reconcile: canReconcile.allowed, vendor: canVendor.allowed }, limited: { invoices: invoices.length === 500, vendorBills: vendorBills.length === 500 } };
  },
  async createCustomer(userId: string, raw: unknown) {
    const input = customerInput.parse(raw);
    if (input.gstin && !gstinPattern.test(input.gstin)) throw new AccessError("GSTIN format is invalid; this does not check whether registration is active");
    if (input.gstRegistrationStatus === "REGISTERED" && !input.gstin) throw new AccessError("Enter the GSTIN for a registered customer");
    if (input.gstRegistrationStatus !== "REGISTERED" && input.gstin) throw new AccessError("Set the customer registration status to Registered or remove the GSTIN");
    const { company } = await scope(client,userId, "labs.billing.manage");
    const row = await client.labsBillingCustomer.create({ data: { ...input, businessName: input.businessName || null, contactPerson: input.contactPerson || null, email: input.email || null, phone: input.phone || null, gstin: input.gstin || null, notes: input.notes || null, companyId: company.id, createdByUserId: userId } });
    await audit(prisma, userId, company.id, "labs.billing_customer_created", "LabsBillingCustomer", row.id, { customerType: row.customerType });
    return row;
  },
  async createService(userId: string, raw: unknown) {
    const input = serviceInput.parse(raw);
    const { company } = await scope(client,userId, "labs.billing.manage");
    const row = await client.labsBillingService.create({ data: { companyId: company.id, category: input.category, name: input.name, description: input.description, scope: input.scope || null, deliverables: input.deliverables || null, pricingBasis: input.pricingBasis, defaultPrice: input.defaultPrice || null, sacCode: input.sacCode || null, placeOfSupplyRule: input.placeOfSupplyRule || null, createdByUserId: userId } });
    await audit(prisma, userId, company.id, "labs.billing_service_drafted", "LabsBillingService", row.id, { status: row.taxApprovalStatus });
    return row;
  },
  async approveServiceTax(userId: string, raw: unknown) {
    const data = z.object({ serviceId: z.string().min(1).max(200), gstBasisPoints: z.number().int().min(0).max(10000), sacCode: z.string().trim().min(1).max(20), evidence: z.string().trim().min(10).max(3000) }).strict().parse(raw);
    const { company } = await scope(client,userId, "labs.billing.review");
    const [service, profile] = await Promise.all([client.labsBillingService.findFirst({ where: { id: data.serviceId, companyId: company.id } }), client.labsBillingProfile.findUnique({ where: { companyId: company.id } })]);
    if (!service || !profile || profile.profileStatus !== "APPROVED_FOR_BILLING" || !profile.approvedTaxBasisPoints || service.createdByUserId === userId) throw new AccessError("A separately prepared service and approved company tax profile are required");
    const approvedRates: number[] = JSON.parse(profile.approvedTaxBasisPoints);
    if (!approvedRates.includes(data.gstBasisPoints)) throw new AccessError("This GST rate is not in the CA-approved company rates");
    const updated = await client.labsBillingService.update({ where: { id: service.id, version: service.version }, data: { sacCode: data.sacCode, gstBasisPoints: data.gstBasisPoints, gstTreatment: data.gstBasisPoints === 0 ? "EXEMPT_OR_ZERO_RATED_CA_REVIEWED" : "TAXABLE_CA_REVIEWED", taxApprovalStatus: "APPROVED", taxEvidence: data.evidence, active: true, reviewedByUserId: userId, reviewedAt: new Date(), version: { increment: 1 } } });
    await audit(prisma, userId, company.id, "labs.billing_service_tax_approved", "LabsBillingService", service.id, { sacCode: data.sacCode, gstBasisPoints: data.gstBasisPoints, version: updated.version });
    return updated;
  },
  async createInvoiceFromQuote(userId: string, raw: unknown) {
    const data = z.object({ quoteId: z.string().min(1).max(200), customerId: z.string().min(1).max(200), serviceIds: z.array(z.string().min(1).max(200)).min(1).max(20), dueDate: z.string().datetime().nullable() }).strict().parse(raw);
    const { company, access } = await scope(client,userId, "labs.billing.issue");
    return client.$transaction(async db => {
      const profile = await db.labsBillingProfile.findUnique({ where: { companyId: company.id } });
      if (!profile || profile.profileStatus !== "APPROVED_FOR_BILLING" || profile.taxReviewStatus !== "APPROVED" || !profile.legalVerifiedAt || !profile.registeredState || !profile.gstin || profile.gstRegistrationStatus !== "REGISTERED" || !profile.approvedTaxBasisPoints) throw new AccessError("Complete legal and CA-approved AIRA Skill City billing setup before issuing invoices");
      const supplierStateCode = stateCode(profile.registeredState);
      if (!supplierStateCode || profile.gstin.slice(0, 2) !== supplierStateCode) throw new AccessError("Registered state must be a recognized Indian State/UT and match the supplier GSTIN state code");
      if (profile.eInvoiceStatus === "PENDING_CA_REVIEW") throw new AccessError("CA must decide whether e-invoicing applies before invoice issuance");
      if (profile.eInvoiceStatus === "APPLICABLE") throw new AccessError("E-invoicing applies. Configure an authorized IRP integration and generate the required IRN before final invoice issuance");
      const companyProfile = await db.companyProfile.findUnique({ where: { organizationId: company.id } });
      let legal: Record<string, unknown> = {};
      try { legal = JSON.parse(companyProfile?.metadata ?? "{}"); } catch { throw new AccessError("Company legal verification metadata is invalid"); }
      if (companyProfile?.legalName !== profile.legalName || (legal as Record<string, unknown>).legalInformationVerified !== true) throw new AccessError("Company registry legal identity and approved billing profile do not match");
      const issuerSetting = await db.systemConfiguration.findUnique({ where: { key: "AIRALABS_BILLING" } });
      if (!issuerSetting) throw new AccessError("Approved issuer configuration unavailable");
      const quoteRow = await db.executiveRecord.findFirst({ where: { id: data.quoteId, organizationId: access.divisionId, kind: "LABS_QUOTE", status: "ACCEPTED" } });
      if (!quoteRow) throw new AccessError("Only an accepted AIRA Labs quotation can be converted");
      if (await db.labsBillingInvoice.findUnique({ where: { quoteId: quoteRow.id } })) throw new AccessError("This quotation has already been converted to an invoice");
      const quote = quotePayload.parse(JSON.parse(quoteRow.payload));
      if (!quote.issuer || !quote.issuedAt || !quote.acceptance || quote.issuer.legalName !== profile.legalName || quote.issuer.taxRegistration !== profile.gstin) throw new AccessError("The accepted quotation does not match the current verified supplier profile");
      if (quote.input.currency !== "INR") throw new AccessError("GST tax invoices currently support INR quotations only");
      const approvedCompanyRates: number[] = JSON.parse(profile.approvedTaxBasisPoints);
      if (!approvedCompanyRates.includes(quote.input.taxBasisPoints)) throw new AccessError("Accepted quotation tax rate is not currently CA-approved");
      const parsedIssuer = billingConfig.parse(JSON.parse(issuerSetting.value));
      if (parsedIssuer.companyId !== company.id || parsedIssuer.legalName !== profile.legalName || parsedIssuer.address !== profile.registeredAddress || parsedIssuer.taxRegistration !== profile.gstin || !parsedIssuer.allowedTaxBasisPoints.includes(quote.input.taxBasisPoints)) throw new AccessError("Canonical issuer and company tax configuration do not match this approved profile");
      const lead = await db.executiveRecord.findFirst({ where: { id: quote.input.leadId, organizationId: access.divisionId, kind: "LABS_LEAD", status: "WON" } });
      if (!lead || leadPayload.parse(JSON.parse(lead.payload)).acceptance.length < 10) throw new AccessError("Linked sale and recorded customer acceptance are required");
      const [customer, services] = await Promise.all([db.labsBillingCustomer.findFirst({ where: { id: data.customerId, companyId: company.id, active: true } }), db.labsBillingService.findMany({ where: { id: { in: data.serviceIds }, companyId: company.id, active: true, taxApprovalStatus: "APPROVED" } })]);
      if (!customer || data.serviceIds.length !== quote.input.items.length || services.length !== data.serviceIds.length || services.some(service => service.gstBasisPoints !== quote.input.taxBasisPoints || !service.sacCode)) throw new AccessError("Select one active customer and one CA-approved matching service for every quotation line, with SAC codes");
      if (customer.gstRegistrationStatus === "REGISTERED" && (!customer.gstin || !gstinPattern.test(customer.gstin))) throw new AccessError("Customer GSTIN needs review before invoicing");
      const totals = quote.totals, taxPaise = moneyPaise(totals.tax);
      const placeOfSupplyCode = stateCode(customer.placeOfSupply);
      if (!placeOfSupplyCode) throw new AccessError("Choose the CA-confirmed place-of-supply State/UT using its full registered name");
      const sameState = placeOfSupplyCode === supplierStateCode;
      const cgst = sameState ? taxPaise / 2n : 0n, sgst = sameState ? taxPaise - cgst : 0n, igst = sameState ? 0n : taxPaise;
      const issuedAt = new Date(), year = fiscalYear(issuedAt), type = "INVOICE";
      if (profile.financialYear !== year) throw new AccessError(`Set the billing profile financial year to ${year} before issuing an invoice`);
      const sequence = await db.labsBillingSequence.upsert({ where: { companyId_documentType_financialYear: { companyId: company.id, documentType: type, financialYear: year } }, create: { companyId: company.id, documentType: type, financialYear: year, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
      const number = sequence.nextNumber === 2 ? 1 : sequence.nextNumber - 1;
      const invoiceNumber = `ASK/INV/${year}/${String(number).padStart(4, "0")}`;
      const customerSnapshot = { customerId: customer.id, customerType: customer.customerType, legalName: customer.legalName, businessName: customer.businessName, contactPerson: customer.contactPerson, email: customer.email, phone: customer.phone, billingAddress: customer.billingAddress, state: customer.state, pinCode: customer.pinCode, gstRegistrationStatus: customer.gstRegistrationStatus, gstin: customer.gstin, placeOfSupply: customer.placeOfSupply };
      let bank: Record<string, unknown> = {};
      try { bank = JSON.parse(profile.bankDetails ?? "{}"); } catch { throw new AccessError("Approved bank details are invalid"); }
      const supplierSnapshot = { legalName: profile.legalName, registeredAddress: profile.registeredAddress, registeredState: profile.registeredState, gstin: profile.gstin, signatory: profile.authorizedSignatory, email: profile.companyEmail, phone: profile.companyPhone, invoiceTerms: profile.invoiceTerms, documentFooter: profile.documentFooter, bank };
      const serviceById = new Map(services.map(service => [service.id, service]));
      const serviceSnapshot = quote.input.items.map((item, index) => { const service = serviceById.get(data.serviceIds[index]); if (!service) throw new AccessError("Selected service unavailable"); return { ...item, serviceId: service.id, serviceName: service.name, sacCode: service.sacCode, gstBasisPoints: quote.input.taxBasisPoints }; });
      const calculationSnapshot = { subtotal: totals.subtotal, discount: totals.discount, taxableValue: formatMoney(moneyPaise(totals.subtotal) - moneyPaise(totals.discount)), gstBasisPoints: quote.input.taxBasisPoints, cgst: formatMoney(cgst), sgst: formatMoney(sgst), igst: formatMoney(igst), tax: totals.tax, total: totals.total, placeOfSupply: customer.placeOfSupply, taxSplit: sameState ? "CGST_SGST" : "IGST", sourceQuoteId: quoteRow.id };
      const invoice = await db.labsBillingInvoice.create({ data: { companyId: company.id, divisionId: access.divisionId, customerId: customer.id, quoteId: quoteRow.id, invoiceNumber, financialYear: year, issueDate: issuedAt, dueDate: data.dueDate ? new Date(data.dueDate) : null, currency: quote.input.currency, customerSnapshot: fingerprintJson(customerSnapshot), supplierSnapshot: fingerprintJson(supplierSnapshot), serviceSnapshot: fingerprintJson(serviceSnapshot), calculationSnapshot: fingerprintJson(calculationSnapshot), totalAmount: totals.total, createdByUserId: userId } });
      await audit(db, userId, company.id, "labs.billing_invoice_issued", "LabsBillingInvoice", invoice.id, { invoiceNumber, quoteId: quoteRow.id, total: totals.total, currency: invoice.currency });
      return invoice;
    }, { timeout: 20000 });
  },
  async recordPayment(userId: string, raw: unknown) {
    const data = paymentInput.parse(raw);
    const { company, access } = await scope(client,userId, "labs.billing.payment");
    return client.$transaction(async db => {
      const invoice = await db.labsBillingInvoice.findFirst({ where: { id: data.invoiceId, companyId: company.id, divisionId: access.divisionId, status: "ISSUED" }, include: { payments: true } });
      if (!invoice) throw new AccessError("Invoice unavailable");
      const received = invoice.payments.filter(payment => payment.verificationStatus === "VERIFIED").reduce((sum, payment) => sum + moneyPaise(payment.amount), 0n);
      const pending = invoice.payments.filter(payment => payment.verificationStatus === "PENDING_RECONCILIATION").reduce((sum, payment) => sum + moneyPaise(payment.amount), 0n);
      const amount = moneyPaise(data.amount), total = moneyPaise(invoice.totalAmount);
      if (amount <= 0n || received + pending + amount > total) throw new AccessError("Payment must be positive and cannot exceed the invoice balance");
      const payment = await db.labsBillingPayment.create({ data: { invoiceId: invoice.id, paymentDate: new Date(data.paymentDate), amount: formatMoney(amount), paymentMode: data.paymentMode, bankReference: data.bankReference || null, notes: data.notes || null, recordedByUserId: userId } });
      await audit(db, userId, company.id, "labs.billing_payment_recorded", "LabsBillingPayment", payment.id, { invoiceNumber: invoice.invoiceNumber, amount: payment.amount, status: payment.verificationStatus });
      return payment;
    });
  },
  async verifyPayment(userId: string, paymentId: string, evidence: string) {
    if (evidence.trim().length < 10 || evidence.length > 2000) throw new AccessError("Enter a bank reconciliation reference or evidence of at least 10 characters");
    const { company, access } = await scope(client,userId, "labs.billing.reconcile");
    return client.$transaction(async db => {
      const payment = await db.labsBillingPayment.findFirst({ where: { id: paymentId, invoice: { companyId: company.id, divisionId: access.divisionId } }, include: { invoice: { include: { payments: true } } } });
      if (!payment || payment.verificationStatus !== "PENDING_RECONCILIATION" || payment.recordedByUserId === userId) throw new AccessError("A payment prepared by another user and awaiting reconciliation is required");
      const alreadyVerified = payment.invoice.payments.filter(row => row.verificationStatus === "VERIFIED").reduce((sum, row) => sum + moneyPaise(row.amount), 0n);
      if (alreadyVerified + moneyPaise(payment.amount) > moneyPaise(payment.invoice.totalAmount)) throw new AccessError("Verified receipts would exceed the invoice total");
      const verified = await db.labsBillingPayment.update({ where: { id: payment.id }, data: { verificationStatus: "VERIFIED", verifiedByUserId: userId, verifiedAt: new Date(), reconciliationEvidence: evidence.trim() } });
      await audit(db, userId, company.id, "labs.billing_payment_reconciled", "LabsBillingPayment", payment.id, { invoiceNumber: payment.invoice.invoiceNumber, amount: payment.amount });
      return verified;
    });
  },
  async createVendorBill(userId: string, raw: unknown) {
    const data = vendorBillInput.parse(raw);
    if (data.vendorGstin && !gstinPattern.test(data.vendorGstin)) throw new AccessError("Vendor GSTIN format is invalid; active registration is not verified");
    const { company } = await scope(client,userId, "labs.billing.vendor");
    const taxable = moneyPaise(data.taxableAmount), cgst = moneyPaise(data.cgst), sgst = moneyPaise(data.sgst), igst = moneyPaise(data.igst);
    if (cgst + sgst > 0n && igst > 0n) throw new AccessError("Record either CGST/SGST or IGST components, not both");
    const total = taxable + cgst + sgst + igst;
    if (taxable <= 0n || total < taxable) throw new AccessError("Vendor bill taxable amount and taxes must be valid");
    return client.$transaction(async db => {
      const bill = await db.labsVendorBill.create({ data: { companyId: company.id, vendorName: data.vendorName, vendorGstin: data.vendorGstin || null, vendorInvoiceNumber: data.vendorInvoiceNumber, billDate: new Date(data.billDate), description: data.description, expenseCategory: data.expenseCategory, taxableAmount: formatMoney(taxable), gstComponents: JSON.stringify({ cgst: formatMoney(cgst), sgst: formatMoney(sgst), igst: formatMoney(igst), taxTotal: formatMoney(cgst + sgst + igst) }), totalAmount: formatMoney(total), dueDate: data.dueDate ? new Date(data.dueDate) : null, createdByUserId: userId } });
      await audit(db, userId, company.id, "labs.vendor_bill_recorded", "LabsVendorBill", bill.id, { total: bill.totalAmount, gstEligibility: "NOT_DETERMINED" });
      return bill;
    });
  },
  async approveVendorBill(userId: string, billId: string, evidence: string) {
    if (evidence.trim().length < 10 || evidence.length > 2000) throw new AccessError("Record supporting approval evidence");
    const { company } = await scope(client,userId, "labs.billing.review");
    return client.$transaction(async db => {
      const bill = await db.labsVendorBill.findFirst({ where: { id: billId, companyId: company.id } });
      if (!bill || bill.approvalStatus !== "PENDING_REVIEW" || bill.createdByUserId === userId) throw new AccessError("An unreviewed vendor bill prepared by another user is required");
      const attachments = await db.labsBillingEvidence.count({ where: { vendorBillId: bill.id, evidenceType: "VENDOR_BILL" } });
      if (!attachments) throw new AccessError("Attach the vendor invoice before independent approval");
      const updated = await db.labsVendorBill.update({ where: { id: bill.id }, data: { approvalStatus: "APPROVED_FOR_RECORD", approvalEvidence: evidence.trim() } });
      await audit(db, userId, company.id, "labs.vendor_bill_approved_for_record", "LabsVendorBill", bill.id, { total: bill.totalAmount, itc: "NOT_DETERMINED", approvalEvidence: evidence.trim() });
      return updated;
    });
  },
  async recordVendorPayment(userId: string, billId: string, paymentDate: string, reference: string) {
    if (!Number.isFinite(new Date(paymentDate).getTime()) || reference.trim().length < 4 || reference.length > 160) throw new AccessError("Enter a valid payment date and bank reference");
    const { company } = await scope(client,userId, "labs.billing.vendor");
    return client.$transaction(async db => {
      const bill = await db.labsVendorBill.findFirst({ where: { id: billId, companyId: company.id } });
      if (!bill || bill.approvalStatus !== "APPROVED_FOR_RECORD" || bill.paymentStatus !== "UNPAID") throw new AccessError("Only an approved unpaid vendor bill can be marked for reconciliation");
      const updated = await db.labsVendorBill.update({ where: { id: bill.id }, data: { paymentStatus: "PENDING_RECONCILIATION", paymentReference: reference.trim(), paymentDate: new Date(paymentDate), paymentRecordedByUserId: userId } });
      await audit(db, userId, company.id, "labs.vendor_bill_payment_recorded", "LabsVendorBill", bill.id, { reference: reference.trim(), amount: bill.totalAmount });
      return updated;
    });
  },
  async verifyVendorPayment(userId: string, billId: string, evidence: string) {
    if (evidence.trim().length < 10 || evidence.length > 2000) throw new AccessError("Enter evidence from the company bank reconciliation");
    const { company } = await scope(client,userId, "labs.billing.reconcile");
    return client.$transaction(async db => {
      const bill = await db.labsVendorBill.findFirst({ where: { id: billId, companyId: company.id } });
      if (!bill || bill.paymentStatus !== "PENDING_RECONCILIATION" || bill.paymentRecordedByUserId === userId) throw new AccessError("A payment recorded by another user is required for independent reconciliation");
      const updated = await db.labsVendorBill.update({ where: { id: bill.id }, data: { paymentStatus: "PAID", paymentVerifiedByUserId: userId, paymentVerifiedAt: new Date(), paymentEvidence: evidence.trim() } });
      await audit(db, userId, company.id, "labs.vendor_bill_payment_reconciled", "LabsVendorBill", bill.id, { reference: bill.paymentReference, amount: bill.totalAmount });
      return updated;
    });
  },
  async reportCsv(userId: string, from: string, to: string) {
    const { company } = await scope(client,userId, "labs.billing.reports");
    const fromDate = new Date(`${from}T00:00:00.000Z`), toDate = new Date(`${to}T23:59:59.999Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) || fromDate > toDate || toDate.getTime() - fromDate.getTime() > 366 * 86400000) throw new AccessError("Choose a valid date range of 366 days or less");
    const [invoices, bills] = await Promise.all([
      client.labsBillingInvoice.findMany({ where: { companyId: company.id, issueDate: { gte: fromDate, lte: toDate } }, orderBy: { issueDate: "asc" }, take: 2000 }),
      client.labsVendorBill.findMany({ where: { companyId: company.id, billDate: { gte: fromDate, lte: toDate } }, orderBy: { billDate: "asc" }, take: 2000 }),
    ]);
    const cell = (value: unknown) => { const raw = String(value ?? ""); const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw; return `"${safe.replaceAll('"', '""')}"`; };
    const lines = [["record_type","document_number","date","counterparty","taxable_value","cgst","sgst","igst","tax_total","gross_total","status","payment_status"].map(cell).join(",")];
    for (const invoice of invoices) { const customer = JSON.parse(invoice.customerSnapshot), tax = JSON.parse(invoice.calculationSnapshot); lines.push(["SALES_INVOICE",invoice.invoiceNumber,invoice.issueDate.toISOString().slice(0,10),customer.legalName,tax.taxableValue,tax.cgst,tax.sgst,tax.igst,tax.tax,invoice.totalAmount,invoice.status,"See invoice payment records"].map(cell).join(",")); }
    for (const bill of bills) { const tax = JSON.parse(bill.gstComponents); lines.push(["VENDOR_BILL",bill.vendorInvoiceNumber,bill.billDate.toISOString().slice(0,10),bill.vendorName,bill.taxableAmount,tax.cgst,tax.sgst,tax.igst,tax.taxTotal,bill.totalAmount,bill.approvalStatus,bill.paymentStatus].map(cell).join(",")); }
    if (invoices.length === 2000 || bills.length === 2000) throw new AccessError("Report range has more than 2,000 records. Narrow the date range.");
    return { filename: `aira-skill-city-accounting-${from}-to-${to}.csv`, csv: `\uFEFF${lines.join("\r\n")}` };
  },
  async invoiceDocument(userId: string, invoiceId: string) {
    const { company, access } = await scope(client,userId, "labs.billing.read");
    const invoice = await client.labsBillingInvoice.findFirst({ where: { id: invoiceId, companyId: company.id, divisionId: access.divisionId } });
    if (!invoice) throw new AccessError("Invoice unavailable");
    return { invoice, supplier: JSON.parse(invoice.supplierSnapshot), customer: JSON.parse(invoice.customerSnapshot), services: JSON.parse(invoice.serviceSnapshot), calculation: JSON.parse(invoice.calculationSnapshot) };
  },
};

}
export const labsBillingOperations = createLabsBillingOperations();
