import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createBossService } from "./boss-service";
import { startupPrograms, startupProgramWhere } from "./startup-programs";
import { intakeProgramCode, isIntakeOpen } from "./startup-intake-policy";
export { intakeProgramCode, isIntakeOpen } from "./startup-intake-policy";

const intakeInput = z.object({
  id: z.string().min(1).max(100).optional(),
  version: z.string().datetime({ offset: true }).optional(),
  programId: z.string().min(1).max(100),
  name: z.string().trim().min(2).max(160),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  capacity: z.preprocess(value => value === "" || value === null ? null : value, z.coerce.number().int().positive().max(100000).nullable()),
  locationId: z.string().max(100).nullable(),
  open: z.boolean()
}).strict();

export function createStartupAdmissionIntakes(client: PrismaClient = prisma) {
  async function scope(userId: string, brandId: string, manage = false) {
    const data = await startupPrograms.list(userId, brandId);
    const { ctx } = await createBossService(client).authority(userId);
    const batchManage = (await ctx.decide("batch.manage", { organizationId: data.divisionId })).allowed;
    const canManage = data.canManage && batchManage;
    if (manage && !canManage) throw new AccessError("Startup intake management is not authorized");
    return { ...data, canManage };
  }

  async function list(userId: string, brandId: string) {
    const data = await scope(userId, brandId);
    const programs = await client.program.findMany({
      where: { ...startupProgramWhere(data.brand.organizationId, data.divisionId, brandId), product: { slug: "pba", divisionId: data.divisionId } },
      select: { id: true, name: true, slug: true, status: true, durationDays: true, capacity: true, priceMinor: true, currency: true },
      orderBy: { name: "asc" }
    });
    const batches = await client.batch.findMany({ where: { programId: { in: programs.map(p => p.id) } }, include: { location: { select: { id: true, name: true, status: true, city: true, region: true } }, _count: { select: { participants: true } } }, orderBy: [{ startDate: "desc" }, { name: "asc" }] });
    const centres = await client.location.findMany({ where: { companyOrganizationId: data.brand.organizationId, organizationId: data.divisionId, status: "ACTIVE" }, select: { id: true, name: true, city: true, region: true }, orderBy: { name: "asc" } });
    return { brand: data.brand, divisionId: data.divisionId, canManage: data.canManage, programs: programs.map(p => ({ ...p, code: intakeProgramCode(p.durationDays, p.slug, p.name) })), batches, centres };
  }

  async function save(userId: string, brandId: string, raw: unknown) {
    const input = intakeInput.parse(raw);
    const data = await scope(userId, brandId, true);
    const startDate = new Date(`${input.startDate}T00:00:00.000Z`), endDate = new Date(`${input.endDate}T23:59:59.999Z`);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate > endDate) throw new AccessError("Choose valid intake dates in chronological order");
    return client.$transaction(async db => {
      const { ctx } = await createBossService(client).authority(userId, db);
      await ctx.requireAccess("program.manage", { organizationId: data.divisionId });
      await ctx.requireAccess("batch.manage", { organizationId: data.divisionId });
      const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
      if (!actor?.personId) throw new AccessError("Reviewer identity unavailable");
      const program = await db.program.findFirst({ where: { id: input.programId, companyOrganizationId: data.brand.organizationId, organizationId: data.divisionId, OR: [{ brandId }, { brandId: null }], product: { slug: "pba", divisionId: data.divisionId } }, select: { id: true, name: true, status: true, capacity: true } });
      if (!program) throw new AccessError("Select an existing PBA program");
      if (input.open && program.status !== "ACTIVE") throw new AccessError("A program must be active before its intake can open");
      if (input.open && !input.locationId) throw new AccessError("Select an existing active centre before opening this intake");
      if (program.capacity !== null && input.capacity !== null && input.capacity > program.capacity) throw new AccessError("Intake capacity cannot exceed the program capacity");
      if (input.locationId) {
        const location = await db.location.findFirst({ where: { id: input.locationId, companyOrganizationId: data.brand.organizationId, organizationId: data.divisionId, status: "ACTIVE" }, select: { id: true } });
        if (!location) throw new AccessError("Select an active Startup Skool centre");
      }
      const status = input.open ? "ACTIVE" : "PLANNED";
      let previous: { status: string; startDate: Date | null; endDate: Date | null; capacity: number | null; locationId: string | null; name: string; updatedAt: Date } | null = null;
      let batchId = input.id;
      if (input.id) {
        previous = await db.batch.findFirst({ where: { id: input.id, programId: program.id }, select: { status: true, startDate: true, endDate: true, capacity: true, locationId: true, name: true, updatedAt: true } });
        if (!previous || !input.version || previous.updatedAt.toISOString() !== input.version) throw new AccessError("Intake changed. Refresh before saving");
        const changed = await db.batch.updateMany({ where: { id: input.id, programId: program.id, updatedAt: previous.updatedAt }, data: { name: input.name, status, startDate, endDate, capacity: input.capacity, locationId: input.locationId } });
        if (changed.count !== 1) throw new AccessError("Intake changed. Refresh before saving");
      } else {
        const created = await db.batch.create({ data: { programId: program.id, name: input.name, status, startDate, endDate, capacity: input.capacity, locationId: input.locationId, metadata: JSON.stringify({ source: "startup-admissions-intake", version: 1 }) }, select: { id: true } });
        batchId = created.id;
      }
      await operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId: data.divisionId, action: input.id ? "startup.admissions.intake_updated" : "startup.admissions.intake_created", entityType: "Batch", entityId: batchId!, result: "SUCCESS", metadata: { programId: program.id, previous: previous ? { name: previous.name, status: previous.status, startDate: previous.startDate?.toISOString() ?? null, endDate: previous.endDate?.toISOString() ?? null, capacity: previous.capacity, locationId: previous.locationId } : null, next: { name: input.name, status, startDate: startDate.toISOString(), endDate: endDate.toISOString(), capacity: input.capacity, locationId: input.locationId } } });
      return { id: batchId, status };
    });
  }

  async function publicAvailability(now = new Date()) {
    const brand = await client.brand.findFirst({ where: { slug: "startup-school", status: "ACTIVE", organization: { slug: "aira-skill-city", type: "COMPANY", status: "ACTIVE" } }, select: { id: true, organizationId: true } });
    if (!brand) return { programs: [] as { code: "PBA_30_DAYS" | "PBA_180_DAYS"; name: string; centres: string[] }[] };
    const division = await client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: brand.organizationId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    if (!division) return { programs: [] as { code: "PBA_30_DAYS" | "PBA_180_DAYS"; name: string; centres: string[] }[] };
    const rows = await client.program.findMany({
      where: { companyOrganizationId: brand.organizationId, organizationId: division.id, OR: [{ brandId: brand.id }, { brandId: null }], status: "ACTIVE", product: { slug: "pba", divisionId: division.id } },
      select: {
        id: true, name: true, slug: true, status: true, durationDays: true, capacity: true,
        batches: {
          where: { status: "ACTIVE" },
          include: { location: { select: { name: true, status: true } }, _count: { select: { participants: true } } }
        }
      }
    });
    const available = new Map<string, { code: "PBA_30_DAYS" | "PBA_180_DAYS"; name: string; centres: string[] }>();
    for (const row of rows) {
      const code = intakeProgramCode(row.durationDays, row.slug, row.name);
      if (!code) continue;
      const open = row.batches.filter(batch => isIntakeOpen({ programStatus: row.status, batchStatus: batch.status, startDate: batch.startDate, endDate: batch.endDate, capacity: null, used: 0, locationStatus: batch.location?.status ?? null }, now));
      if (!open.length) continue;
      const batchCapacity = open.some(batch => batch.capacity === null) ? null : open.reduce((total, batch) => total + (batch.capacity ?? 0), 0);
      const effectiveCapacity = row.capacity === null ? batchCapacity : batchCapacity === null ? row.capacity : Math.min(row.capacity, batchCapacity);
      if (effectiveCapacity !== null) {
        const firstOpenDate = open.reduce((earliest, batch) => batch.startDate && batch.startDate < earliest ? batch.startDate : earliest, open[0]!.startDate!);
        const [pendingPublicApplications, pendingLegacyApplications] = await Promise.all([
          client.startupPublicApplicant.count({ where: { organizationId: brand.organizationId, programPreference: code, status: { in: ["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED"] }, submittedAt: { not: null, gte: firstOpenDate } } }),
          client.executiveRecord.count({ where: { organizationId: division.id, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: { in: ["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED"] }, createdAt: { gte: firstOpenDate }, payload: { contains: code } } })
        ]);
        const participantCount = open.reduce((total, batch) => total + batch._count.participants, 0);
        if (participantCount + pendingPublicApplications + pendingLegacyApplications >= effectiveCapacity) continue;
      }
      available.set(code, { code, name: row.name, centres: [...new Set(open.flatMap(batch => batch.location?.name ? [batch.location.name] : []))] });
    }
    return { programs: [...available.values()] };
  }

  return { list, save, publicAvailability };
}

export const startupAdmissionIntakes = createStartupAdmissionIntakes();
