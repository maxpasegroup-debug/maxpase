import { z } from "zod";
import { prisma } from "@/server/db";
import { requirePortalAccess } from "@/server/portals/policy";
import { AccessError } from "@/server/authorization/engine";

const profileInput = z.object({
  legalName: z.string().trim().max(200).default(""),
  registeredAddress: z.string().trim().max(1000).default(""),
  registeredState: z.string().trim().max(100).default(""),
  gstin: z.string().trim().toUpperCase().max(15).default(""),
  gstRegistrationStatus: z.enum(["REGISTERED", "PENDING", "CANCELLED", "NOT_CONFIRMED"]).default("NOT_CONFIRMED"),
  pan: z.string().trim().toUpperCase().max(10).default(""),
  financialYear: z.string().trim().max(20).default(""),
  companyEmail: z.string().trim().email().max(254).or(z.literal("")).default(""),
  companyPhone: z.string().trim().max(30).default(""),
  logoReference: z.string().trim().max(500).default(""),
  authorizedSignatory: z.string().trim().max(200).default(""),
  bankName: z.string().trim().max(160).default(""),
  accountHolder: z.string().trim().max(200).default(""),
  accountNumber: z.string().trim().max(40).default(""),
  ifsc: z.string().trim().toUpperCase().max(11).default(""),
  branch: z.string().trim().max(160).default(""),
  paymentInstructions: z.string().trim().max(1000).default(""),
  quotationTerms: z.string().trim().max(3000).default(""),
  invoiceTerms: z.string().trim().max(3000).default(""),
  documentFooter: z.string().trim().max(1000).default(""),
  evidenceReferences: z.string().trim().max(3000).default(""),
  version: z.number().int().min(0),
}).strict();

async function scoped(userId: string, permission: string) {
  const gateway = await requirePortalAccess(prisma, userId, "labs");
  await gateway.ctx.requireAccess(permission, { organizationId: gateway.divisionId });
  const company = await prisma.organization.findUnique({ where: { id: gateway.companyId }, select: { id: true, slug: true, company: { select: { legalName: true, status: true } } } });
  if (!company || company.slug !== "aira-skill-city" || company.company?.status !== "ACTIVE") throw new AccessError("AIRA Skill City company scope unavailable");
  return { gateway, company };
}

export const labsBillingProfile = {
  async read(userId: string) {
    const { company, gateway } = await scoped(userId, "labs.billing.read");
    const capabilities = await Promise.all(["labs.billing.manage", "labs.billing.review"].map(key => gateway.ctx.decide(key, { organizationId: gateway.divisionId })));
    const row = await prisma.labsBillingProfile.findUnique({ where: { companyId: company.id } });
    if (!row) return { profile: null, canonicalLegalName: company.company?.legalName ?? null, evidence: [], canManage: capabilities[0].allowed, canReview: capabilities[1].allowed };
    return {
      profile: { ...row, bankDetails: capabilities[0].allowed ? row.bankDetails : null, canManage: capabilities[0].allowed, canReview: capabilities[1].allowed },
      canonicalLegalName: company.company?.legalName ?? null,
      evidence: await prisma.labsBillingEvidence.findMany({ where: { profileId: row.id }, select: { id: true, evidenceType: true, fileName: true, uploadedByUserId: true, verifiedByUserId: true, verifiedAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 }),
      canManage: capabilities[0].allowed,
      canReview: capabilities[1].allowed,
    };
  },
  async save(userId: string, raw: unknown) {
    const data = profileInput.parse(raw);
    if (data.financialYear && !/^[0-9]{4}-[0-9]{2}$/.test(data.financialYear)) throw new AccessError("Financial year must use YYYY-YY format, for example 2026-27");
    const { company } = await scoped(userId, "labs.billing.manage");
    if (data.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gstin)) throw new AccessError("GSTIN format is invalid; this check does not verify active registration");
    if (data.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan)) throw new AccessError("PAN format is invalid");
    const existing = await prisma.labsBillingProfile.findUnique({ where: { companyId: company.id } });
    if ((existing?.version ?? 0) !== data.version) throw new AccessError("Billing profile changed; refresh before saving");
    const uploadedEvidence = existing ? await prisma.labsBillingEvidence.findMany({ where: { profileId: existing.id }, select: { evidenceType: true } }) : [];
    const evidenceTypes = new Set(uploadedEvidence.map(item => item.evidenceType));
    const requiredEvidence = ["CERTIFICATE_OF_INCORPORATION", "GST_CERTIFICATE", "ADDRESS_PROOF", "BANK_PROOF", "SIGNATORY_EVIDENCE", ...(data.pan ? ["PAN_EVIDENCE"] : [])];
    const bankComplete = !!data.bankName && !!data.accountHolder && !!data.accountNumber && !!data.ifsc && !!data.branch;
    const complete = !!data.legalName && !!data.registeredAddress && !!data.registeredState && !!data.gstin && data.gstRegistrationStatus === "REGISTERED" && !!data.financialYear && !!data.authorizedSignatory && bankComplete && data.evidenceReferences.length >= 10 && requiredEvidence.every(type => evidenceTypes.has(type));
    const bankDetails = JSON.stringify({ bankName: data.bankName, accountHolder: data.accountHolder, accountNumber: data.accountNumber, ifsc: data.ifsc, branch: data.branch, paymentInstructions: data.paymentInstructions });
    const row = await prisma.$transaction(async db => {
      const current = await db.labsBillingProfile.findUnique({ where: { companyId: company.id } });
      if ((current?.version ?? 0) !== data.version) throw new AccessError("Billing profile changed; refresh before saving");
      const updated = await db.labsBillingProfile.upsert({
        where: { companyId: company.id },
        create: { companyId: company.id, legalName: data.legalName || null, registeredAddress: data.registeredAddress || null, registeredState: data.registeredState || null, gstin: data.gstin || null, gstRegistrationStatus: data.gstRegistrationStatus, pan: data.pan || null, financialYear: data.financialYear || null, companyEmail: data.companyEmail || null, companyPhone: data.companyPhone || null, logoReference: data.logoReference || null, authorizedSignatory: data.authorizedSignatory || null, bankDetails, quotationTerms: data.quotationTerms || null, invoiceTerms: data.invoiceTerms || null, documentFooter: data.documentFooter || null, verificationEvidence: data.evidenceReferences || null, profileStatus: complete ? "PENDING_VERIFICATION" : "INCOMPLETE", updatedByUserId: userId },
        update: { legalName: data.legalName || null, registeredAddress: data.registeredAddress || null, registeredState: data.registeredState || null, gstin: data.gstin || null, gstRegistrationStatus: data.gstRegistrationStatus, pan: data.pan || null, financialYear: data.financialYear || null, companyEmail: data.companyEmail || null, companyPhone: data.companyPhone || null, logoReference: data.logoReference || null, authorizedSignatory: data.authorizedSignatory || null, bankDetails, quotationTerms: data.quotationTerms || null, invoiceTerms: data.invoiceTerms || null, documentFooter: data.documentFooter || null, verificationEvidence: data.evidenceReferences || null, profileStatus: complete ? "PENDING_VERIFICATION" : "INCOMPLETE", legalVerifiedAt: null, legalVerifiedByUserId: null, caReviewedAt: null, caReviewedByUserId: null, taxReviewStatus: "PENDING_CA_REVIEW", approvedTaxBasisPoints: null, taxReviewEvidence: null, eInvoiceStatus: "PENDING_CA_REVIEW", eInvoiceReviewNote: null, updatedByUserId: userId, version: { increment: 1 } },
      });
      await db.labsBillingEvidence.updateMany({ where: { profileId: updated.id }, data: { verifiedByUserId: null, verifiedAt: null } });
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
      await db.auditEvent.create({ data: { actorUserId: userId, actorPersonId: user.personId, organizationId: company.id, action: "labs.billing_profile_saved", entityType: "LabsBillingProfile", entityId: updated.id, result: "SUCCESS", metadata: JSON.stringify({ profileStatus: updated.profileStatus, version: updated.version }) } });
      return updated;
    });
    return row;
  },
  async verifyLegal(userId: string, evidence: string) {
    const { company } = await scoped(userId, "labs.billing.review");
    const row = await prisma.labsBillingProfile.findUnique({ where: { companyId: company.id } });
    if (!row || row.profileStatus !== "PENDING_VERIFICATION" || row.updatedByUserId === userId) throw new AccessError("A complete profile prepared by another user is required for independent legal verification");
    if (!row.legalName || row.legalName.trim().toLocaleUpperCase("en-IN") !== company.company?.legalName?.trim().toLocaleUpperCase("en-IN") || !row.registeredAddress || !row.registeredState || !row.gstin || row.gstRegistrationStatus !== "REGISTERED" || !row.financialYear || evidence.trim().length < 10) throw new AccessError("Legal identity, registered state, GST status, financial year and evidence reference must be verified");
    const uploadedEvidence = await prisma.labsBillingEvidence.findMany({ where: { profileId: row.id }, select: { id: true, evidenceType: true } });
    const requiredEvidence = ["CERTIFICATE_OF_INCORPORATION", "GST_CERTIFICATE", "ADDRESS_PROOF", "BANK_PROOF", "SIGNATORY_EVIDENCE", ...(row.pan ? ["PAN_EVIDENCE"] : [])];
    if (requiredEvidence.some(type => !uploadedEvidence.some(item => item.evidenceType === type))) throw new AccessError("Upload the required incorporation, GST, address, bank, signatory and applicable PAN evidence before verification");
    return prisma.$transaction(async db => {
      const current = await db.companyProfile.findUnique({ where: { organizationId: company.id } });
      if (!current) throw new AccessError("Company registry profile unavailable");
      let legal: Record<string, unknown> = {};
      try { const parsed = JSON.parse(current.metadata ?? "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) legal = parsed; } catch { throw new AccessError("Company registry evidence metadata is invalid"); }
      const updated = await db.labsBillingProfile.update({ where: { id: row.id, version: row.version }, data: { profileStatus: "PENDING_CA_REVIEW", legalVerifiedAt: new Date(), legalVerifiedByUserId: userId, verificationEvidence: evidence.trim(), version: { increment: 1 } } });
      await db.labsBillingEvidence.updateMany({ where: { id: { in: uploadedEvidence.map(item => item.id) }, profileId: row.id }, data: { verifiedByUserId: userId, verifiedAt: new Date() } });
      await db.companyProfile.update({ where: { id: current.id }, data: { metadata: JSON.stringify({ ...legal, legalInformationVerified: true, legalVerificationEvidence: evidence.trim() }) } });
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
      await db.auditEvent.create({ data: { actorUserId: userId, actorPersonId: user.personId, organizationId: company.id, action: "labs.billing_profile_legal_verified", entityType: "LabsBillingProfile", entityId: row.id, result: "SUCCESS", metadata: JSON.stringify({ version: updated.version }) } });
      return updated;
    });
  },
  async reviewTax(userId: string, raw: unknown) {
    const data = z.object({ serviceAndTaxEvidence: z.string().trim().min(10).max(3000), approvedTaxBasisPoints: z.array(z.number().int().min(0).max(10000)).min(1).max(20), eInvoiceStatus: z.enum(["APPLICABLE", "NOT_APPLICABLE"]), eInvoiceEvidence: z.string().trim().min(10).max(3000) }).strict().parse(raw);
    const { company, gateway } = await scoped(userId, "labs.billing.review");
    const row = await prisma.labsBillingProfile.findUnique({ where: { companyId: company.id } });
    if (!row || row.profileStatus !== "PENDING_CA_REVIEW" || !row.legalVerifiedAt || row.legalVerifiedByUserId === userId || row.updatedByUserId === userId) throw new AccessError("Independent legal verification is required before CA review");
    if (!(await gateway.ctx.decide("labs.quote.issue", { organizationId: gateway.divisionId })).allowed) throw new AccessError("CA reviewer must also be an authorized billing approver to configure rates");
    const updated = await prisma.$transaction(async db => {
      const saved = await db.labsBillingProfile.update({ where: { id: row.id, version: row.version }, data: { profileStatus: "APPROVED_FOR_BILLING", taxReviewStatus: "APPROVED", approvedTaxBasisPoints: JSON.stringify([...new Set(data.approvedTaxBasisPoints)].sort((a,b)=>a-b)), taxReviewEvidence: data.serviceAndTaxEvidence, eInvoiceStatus: data.eInvoiceStatus, eInvoiceReviewNote: data.eInvoiceEvidence, caReviewedAt: new Date(), caReviewedByUserId: userId, version: { increment: 1 } } });
      const billingKey = "AIRALABS_BILLING";
      const billingValue = JSON.stringify({ companyId: company.id, legalName: row.legalName, address: row.registeredAddress, taxRegistration: row.gstin, verificationEvidence: row.verificationEvidence, authorizedByUserId: userId, allowedTaxBasisPoints: [...new Set(data.approvedTaxBasisPoints)] });
      await db.systemConfiguration.upsert({ where: { key: billingKey }, create: { key: billingKey, value: billingValue, description: "CA-reviewed AIRA Labs billing profile; legal and tax evidence is in the scoped billing register" }, update: { value: billingValue, description: "CA-reviewed AIRA Labs billing profile; legal and tax evidence is in the scoped billing register" } });
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
      await db.auditEvent.create({ data: { actorUserId: userId, actorPersonId: user.personId, organizationId: company.id, action: "labs.billing_profile_ca_reviewed", entityType: "LabsBillingProfile", entityId: row.id, result: "SUCCESS", metadata: JSON.stringify({ eInvoiceStatus: data.eInvoiceStatus, approvedTaxBasisPoints: data.approvedTaxBasisPoints, version: saved.version, serviceAndTaxEvidence: data.serviceAndTaxEvidence }) } });
      return saved;
    });
    return updated;
  },
};
