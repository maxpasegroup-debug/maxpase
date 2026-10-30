import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

// A company-wide, PII-free identity key links product enquiries. Each lead keeps
// its own division scope; this record never grants access to another pipeline.
export async function resolveCrmContact(db: Prisma.TransactionClient, companyId: string, email: string, custodianPersonId: string) {
  const normalized = email.trim().toLowerCase();
  const digest = createHash("sha256").update(JSON.stringify([companyId, normalized])).digest("hex");
  const sourceKey = `aira:contact:${digest}`;
  const contact = await db.executiveRecord.upsert({ where: { sourceKey }, update: {}, create: { organizationId: companyId, ownerPersonId: custodianPersonId, kind: "AIRA_CRM_CONTACT", title: "CRM contact", status: "ACTIVE", sourceKey, payload: JSON.stringify({ identityVersion: 1 }) }, select: { id: true, kind: true, organizationId: true } });
  if (contact.kind !== "AIRA_CRM_CONTACT" || contact.organizationId !== companyId) throw new Error("CRM identity collision");
  return contact.id;
}
