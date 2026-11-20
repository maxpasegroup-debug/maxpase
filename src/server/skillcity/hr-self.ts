import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { operationalEvent } from "@/server/domain/operational-events";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { createHrDocuments } from "@/server/group/hr-documents";

export function createHrSelf(client: PrismaClient = prisma) {
  const documents = createHrDocuments(client);
  async function profile(userId: string) {
    await requirePortalAccess(client, userId, "skillcity");
    const user = await client.user.findUnique({ where: { id: userId }, select: { personId: true, status: true, email: true, person: { select: { displayName: true, metadata: true } } } });
    if (!user?.personId || user.status !== "ACTIVE") throw new AccessError("Employee profile unavailable");
    const employment = await client.employment.findMany({ where: { personId: user.personId, company: { slug: "aira-skill-city" } }, select: { id: true, status: true, designation: true, employmentType: true, startDate: true, endDate: true, contactEmail: true, contactPhone: true, emergencyContactName: true, emergencyContactRelationship: true, emergencyContactPhone: true, emergencyContactEmail: true, company: { select: { name: true } }, assignments: { select: { id: true, status: true, designation: true, startDate: true, endDate: true, brand: { select: { name: true } }, department: { select: { name: true } }, manager: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: { createdAt: "desc" }, take: 20 });
    const invitation = await client.emailAuthChallenge.findFirst({ where: { userId, purpose: "STAFF_INVITE" }, select: { status: true, createdAt: true, consumedAt: true }, orderBy: { createdAt: "desc" } });
    let address = "";
    try { const metadata = JSON.parse(user.person?.metadata ?? "{}"); address = typeof metadata.employeeSelfProfile?.address === "string" ? metadata.employeeSelfProfile.address : ""; } catch { /* malformed metadata remains visible to authorized HR, but is not overwritten here */ }
    return { name: user.person?.displayName ?? user.email, email: user.email, address, accountStatus: user.status, employment, invitation, documentsConfigured: documents.configured(), documents: await documents.selfDocuments(userId) };
  }

  async function updateProfile(userId: string, raw: unknown) {
    const input = z.object({ employmentId: z.string().min(1).max(200), displayName: z.string().trim().min(2).max(200), address: z.string().trim().max(1000), contactEmail: z.union([z.literal(""), z.email().max(254)]).transform(v => v ? v.toLowerCase() : null), contactPhone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/)]).transform(v => v || null), emergencyContactName: z.string().trim().max(160), emergencyContactRelationship: z.string().trim().max(80), emergencyContactPhone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/)]).transform(v => v || null), emergencyContactEmail: z.union([z.literal(""), z.email().max(254)]).transform(v => v ? v.toLowerCase() : null) }).strict().parse(raw);
    await requirePortalAccess(client, userId, "skillcity");
    return client.$transaction(async db => {
      const user = await db.user.findUnique({ where: { id: userId }, select: { personId: true, status: true, person: { select: { metadata: true } } } });
      const employment = user?.personId ? await db.employment.findUnique({ where: { id: input.employmentId }, include: { company: { select: { slug: true } } } }) : null;
      if (!user?.personId || user.status !== "ACTIVE" || !employment || employment.personId !== user.personId || employment.company.slug !== "aira-skill-city" || employment.status !== "ACTIVE") throw new AccessError("Active employee profile unavailable");
      let metadata: Record<string, unknown>;
      try { metadata = JSON.parse(user.person?.metadata ?? "{}"); } catch { throw new AccessError("Employee profile needs authorized HR review before it can be updated"); }
      const priorProfile = metadata.employeeSelfProfile && typeof metadata.employeeSelfProfile === "object" && !Array.isArray(metadata.employeeSelfProfile) ? metadata.employeeSelfProfile as Record<string, unknown> : {};
      await db.person.update({ where: { id: user.personId }, data: { displayName: input.displayName, metadata: JSON.stringify({ ...metadata, employeeSelfProfile: { ...priorProfile, address: input.address } }) } });
      await db.employment.update({ where: { id: employment.id }, data: { contactEmail: input.contactEmail, contactPhone: input.contactPhone, emergencyContactName: input.emergencyContactName || null, emergencyContactRelationship: input.emergencyContactRelationship || null, emergencyContactPhone: input.emergencyContactPhone, emergencyContactEmail: input.emergencyContactEmail } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: user.personId, organizationId: employment.companyId, action: "hr.employee_self_profile_updated", entityType: "Employment", entityId: employment.id, result: "SUCCESS", metadata: { selfService: true, fields: ["displayName", "address", "contactEmail", "contactPhone", "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone", "emergencyContactEmail"] } });
      return { saved: true };
    });
  }
  return { profile, updateProfile };
}
export const hrSelf = createHrSelf();
