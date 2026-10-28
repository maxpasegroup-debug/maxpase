import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "./policy";
import { assertStartupPilotEnrollmentReady } from "./startup-pilot-register";

export function createStartupStudentService(client: PrismaClient = prisma) {
  async function dashboard(userId: string) {
    const access = await requirePortalAccess(client, userId, "startup");
    const personId = access.ctx.user?.personId;
    if (!personId) throw new AccessError("Student identity unavailable");
    const rows = await client.batchParticipant.findMany({ where: { personId, status: { in: ["PLANNED", "ACTIVE"] }, batch: { status: { in: ["PLANNED", "ACTIVE"] }, program: { organizationId: access.divisionId, companyOrganizationId: access.companyId, status: "ACTIVE" } } }, select: { id: true, status: true, batchId: true, batch: { select: { name: true, startDate: true, endDate: true, program: { select: { id: true, organizationId: true, productId: true, name: true, description: true, durationDays: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 });
    const checked = await Promise.all(rows.map(async row => {
      try { await assertStartupPilotEnrollmentReady(client, row.batch.program, row.batchId, personId); return row; }
      catch (error) { if (error instanceof AccessError) return null; throw error; }
    }));
    return checked.filter(row => row !== null).map(row => ({ id: row.id, status: row.status, batch: row.batch.name, start: row.batch.startDate, end: row.batch.endDate, program: row.batch.program.name, description: row.batch.program.description, durationDays: row.batch.program.durationDays }));
  }
  return { dashboard };
}

export const startupStudentService = createStartupStudentService();
