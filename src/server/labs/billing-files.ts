import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { requirePortalAccess } from "@/server/portals/policy";
import { AccessError } from "@/server/authorization/engine";
import { privateContentStorage } from "@/server/nicejobs/content-storage";
import { validateContentFile } from "@/server/nicejobs/content-validation";

const storage = privateContentStorage();
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const evidenceTypes = ["CERTIFICATE_OF_INCORPORATION", "GST_CERTIFICATE", "PAN_EVIDENCE", "ADDRESS_PROOF", "BANK_PROOF", "SIGNATORY_EVIDENCE", "VENDOR_BILL"] as const;

async function boundary(userId: string, permission: string) {
  const access = await requirePortalAccess(prisma, userId, "labs");
  await access.ctx.requireAccess(permission, { organizationId: access.divisionId });
  const company = await prisma.organization.findUnique({ where: { id: access.companyId }, select: { id: true, slug: true } });
  if (!company || company.slug !== "aira-skill-city") throw new AccessError("AIRA Skill City company scope unavailable");
  return { access, company };
}

export const labsBillingFiles = {
  types: evidenceTypes,
  async upload(userId: string, raw: { filename: string; mime: string; evidenceType: string; vendorBillId?: string }, bytes: Uint8Array) {
    const type = evidenceTypes.find(value => value === raw.evidenceType);
    if (!type) throw new AccessError("Evidence type unavailable");
    const validated = await validateContentFile(raw.filename, raw.mime, bytes);
    if (!["PDF", "IMAGE"].includes(validated.mediaType) || validated.bytes > 20 * 1024 * 1024) throw new AccessError("Company evidence must be a PDF or image up to 20 MB");
    const { access, company } = await boundary(userId, "labs.billing.manage");
    const profile = type === "VENDOR_BILL" ? null : await prisma.labsBillingProfile.findUnique({ where: { companyId: company.id } });
    if (type !== "VENDOR_BILL" && !profile) throw new AccessError("Save the company billing profile before uploading evidence");
    if (type === "VENDOR_BILL" && !raw.vendorBillId) throw new AccessError("Select the vendor bill for this attachment");
    const vendorBill = type === "VENDOR_BILL" ? await prisma.labsVendorBill.findFirst({ where: { id: raw.vendorBillId, companyId: company.id } }) : null;
    if (type === "VENDOR_BILL" && !vendorBill) throw new AccessError("Vendor bill unavailable");
    const id = randomUUID(), idempotencyKey = randomUUID(), fileDigest = digest(bytes), fingerprint = createHash("sha256").update(JSON.stringify({ companyId: company.id, divisionId: access.divisionId, type, fileDigest })).digest("hex");
    let written = false;
    try {
      await storage.write(id, bytes); written = true;
      const result = await prisma.$transaction(async db => {
        const current = await requirePortalAccess(db, userId, "labs");
        await current.ctx.requireAccess("labs.billing.manage", { organizationId: current.divisionId });
        if (current.companyId !== company.id || current.divisionId !== access.divisionId) throw new AccessError("Billing scope changed during upload");
        const file = await db.niceJobsContentFile.create({ data: { id, companyId: company.id, organizationId: access.divisionId, uploaderUserId: userId, idempotencyKey, fingerprint, digest: fileDigest, ...validated } });
        const evidence = await db.labsBillingEvidence.create({ data: { companyId: company.id, profileId: profile?.id ?? null, vendorBillId: vendorBill?.id ?? null, evidenceType: type, fileName: file.filename, storageKey: file.id, mimeType: file.mime, sizeBytes: file.bytes, uploadedByUserId: userId } });
        const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
        await db.auditEvent.create({ data: { actorUserId: userId, actorPersonId: user.personId, organizationId: company.id, action: "labs.billing_evidence_uploaded", entityType: "LabsBillingEvidence", entityId: evidence.id, result: "SUCCESS", metadata: JSON.stringify({ evidenceType: type, bytes: file.bytes, digest: fileDigest }) } });
        return { id: evidence.id, evidenceType: evidence.evidenceType, fileName: evidence.fileName, sizeBytes: evidence.sizeBytes };
      }, { timeout: 20000 });
      return result;
    } catch (error) {
      if (written && !(await prisma.niceJobsContentFile.findUnique({ where: { id } }))) await storage.rollback(id);
      throw error;
    }
  },
  async download(userId: string, evidenceId: string) {
    const { access, company } = await boundary(userId, "labs.billing.read");
    const evidence = await prisma.labsBillingEvidence.findFirst({ where: { id: evidenceId, companyId: company.id }, include: { profile: { select: { companyId: true } }, vendorBill: { select: { companyId: true } } } });
    if (!evidence || evidence.profile?.companyId !== company.id && evidence.vendorBill?.companyId !== company.id) throw new AccessError("Evidence unavailable");
    const file = await prisma.niceJobsContentFile.findFirst({ where: { id: evidence.storageKey, companyId: company.id, organizationId: access.divisionId } });
    if (!file) throw new AccessError("Evidence unavailable");
    const bytes = await storage.read(file.id);
    if (bytes.length !== file.bytes || digest(bytes) !== file.digest) throw new AccessError("Evidence integrity check failed");
    return { filename: file.filename, mime: file.mime, bytes };
  },
};
