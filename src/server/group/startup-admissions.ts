import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { parseStartupApplicationPayload } from "@/server/portals/startup-applications";
import { createBossRegistry } from "./boss-registry";
import { createBossService } from "./boss-service";
import { z } from "zod";

export const admissionStatuses = ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED"] as const;
export function startupAdmissionsWhere(divisionId: string, search = "", status?: string): Prisma.ExecutiveRecordWhereInput {
  const term = search.trim().slice(0, 100);
  return { organizationId: divisionId, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" },
    status: status && admissionStatuses.includes(status as typeof admissionStatuses[number]) ? status : { in: [...admissionStatuses] },
    ...(term ? { owner: { displayName: { contains: term, mode: "insensitive" } } } : {}) };
}
export function createStartupAdmissions(client: PrismaClient = prisma) {
  const registry = createBossRegistry(client), boss = createBossService(client);
  async function access(userId: string, brandId: string) {
    const brand = await registry.brand(userId, brandId);
    if (!brand.startupDivision || brand.programs === null) throw new AccessError("Startup admissions unavailable");
    const { ctx } = await boss.authority(userId);
    await ctx.requireAccess("program.read", { organizationId: brand.startupDivision });
    await ctx.requireAccess("person.read", { organizationId: brand.startupDivision });
    await ctx.requireAccess("executive.read", { organizationId: brand.startupDivision });
    const active = brand.startupDivisionActive && brand.row.status === "ACTIVE" && brand.row.organization.status === "ACTIVE" && brand.row.organization.company?.status === "ACTIVE";
    return { brand, canReview: active && (await ctx.decide("program.manage", { organizationId: brand.startupDivision })).allowed, canConfirm: active && (await ctx.decide("program.manage", { organizationId: brand.startupDivision })).allowed && (await ctx.decide("batch.manage", { organizationId: brand.startupDivision })).allowed };
  }
  async function list(userId: string, brandId: string, query: { search?: string; status?: string; recordId?: string } = {}) {
    const { brand, canReview, canConfirm } = await access(userId, brandId);
    const divisionId = brand.startupDivision!;
    const rows = await client.executiveRecord.findMany({ where: startupAdmissionsWhere(divisionId, query.search, query.status),
      select: { id: true, status: true, version: true, payload: true, createdAt: true, updatedAt: true, owner: { select: { displayName: true } },
        history: { select: { id: true, fromStatus: true, toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 101 });
    const programs = await client.program.findMany({ where: { companyOrganizationId: brand.row.organizationId, organizationId: divisionId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] }, OR: [{ brandId }, { brandId: null }], product: { organizationId: brand.row.organizationId, slug: "pba", divisionId } }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" }, take: 100 });
    const counts = await client.executiveRecord.groupBy({ by: ["status"], where: startupAdmissionsWhere(divisionId), _count: { _all: true } });
    const selected = query.recordId && !rows.some(row => row.id === query.recordId) ? await client.executiveRecord.findFirst({ where: { id: query.recordId, ...startupAdmissionsWhere(divisionId) }, select: { id: true, status: true, version: true, payload: true, createdAt: true, updatedAt: true, owner: { select: { displayName: true } }, history: { select: { id: true, fromStatus: true, toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 } } }) : null;
    const present = rows.slice(0, 100).map(row => ({ ...row, answers: parseStartupApplicationPayload(row.payload), payload: undefined }));
    const selectedRow = selected ? { ...selected, answers: parseStartupApplicationPayload(selected.payload), payload: undefined } : present.find(row => row.id === query.recordId) ?? null;
    const admission = selectedRow?.status === "APPROVED" ? await client.executiveRecord.findUnique({ where: { sourceKey: `startup:admission:${selectedRow.id}` }, select: { kind: true, status: true, organizationId: true, payload: true } }) : null;
    let admissionMapping: { applicationId: string; programId: string } | null = null;
    try { admissionMapping = z.object({ applicationId: z.string(), programId: z.string() }).passthrough().parse(JSON.parse(admission?.payload ?? "null")); } catch { /* Malformed records must not appear confirmed. */ }
    const confirmedAdmission = selectedRow && admissionMapping && admission?.kind === "STARTUP_ADMISSION" && admission.organizationId === divisionId && admission.status === "CONFIRMED" && admissionMapping.applicationId === selectedRow.id && admissionMapping.programId === selectedRow.answers.programId ? admission : null;
    const batches = canConfirm && selectedRow?.status === "APPROVED" && selectedRow.answers.programId && !confirmedAdmission ? await client.batch.findMany({ where: { programId: selectedRow.answers.programId, status: "ACTIVE", program: { companyOrganizationId: brand.row.organizationId, organizationId: divisionId, status: "ACTIVE", OR: [{ brandId }, { brandId: null }] } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 50 }) : [];
    return { brand: brand.row, canReview, canConfirm, rows: present, selected: selectedRow, programs, batches, confirmedAdmission: !!confirmedAdmission, hasMore: rows.length > 100, counts: Object.fromEntries(admissionStatuses.map(status => [status, counts.find(row => row.status === status)?._count._all ?? 0])) as Record<typeof admissionStatuses[number], number> };
  }
  return { list };
}
export const startupAdmissions = createStartupAdmissions();
