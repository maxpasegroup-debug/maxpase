import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { createHrDocuments } from "@/server/group/hr-documents";

export function createHrSelf(client: PrismaClient = prisma) {
  const documents = createHrDocuments(client);
  async function profile(userId: string) {
    await requirePortalAccess(client, userId, "skillcity");
    const user = await client.user.findUnique({ where: { id: userId }, select: { personId: true, status: true, email: true, person: { select: { displayName: true } } } });
    if (!user?.personId || user.status !== "ACTIVE") throw new AccessError("Employee profile unavailable");
    const employment = await client.employment.findMany({ where: { personId: user.personId, company: { slug: "aira-skill-city" } }, select: { id: true, status: true, designation: true, employmentType: true, startDate: true, endDate: true, company: { select: { name: true } }, assignments: { select: { id: true, status: true, designation: true, startDate: true, endDate: true, brand: { select: { name: true } }, department: { select: { name: true } }, manager: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: { createdAt: "desc" }, take: 20 });
    const invitation = await client.emailAuthChallenge.findFirst({ where: { userId, purpose: "STAFF_INVITE" }, select: { status: true, createdAt: true, consumedAt: true }, orderBy: { createdAt: "desc" } });
    return { name: user.person?.displayName ?? user.email, email: user.email, accountStatus: user.status, employment, invitation, documentsConfigured: documents.configured(), documents: await documents.selfDocuments(userId) };
  }
  return { profile };
}
export const hrSelf = createHrSelf();
