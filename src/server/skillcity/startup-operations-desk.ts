import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { privateContentStorage } from "@/server/nicejobs/content-storage";
import { validateContentFile } from "@/server/nicejobs/content-validation";

const kinds = ["UPDATE", "REQUEST", "BILL", "REPORT"] as const;
const inputSchema = z.object({
  kind: z.enum(kinds), title: z.string().trim().min(3).max(140), details: z.string().trim().min(10).max(5000),
  department: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), district: z.string().trim().min(2).max(100),
  centre: z.string().trim().max(160).optional().default(""), dueAt: z.string().datetime().optional().or(z.literal("")), amount: z.string().optional().default(""),
}).strict().superRefine((v, ctx) => {
  if (v.kind === "BILL" && (!/^\d{1,9}(\.\d{1,2})?$/.test(v.amount) || Number(v.amount) <= 0)) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid bill amount." });
  if (v.kind !== "BILL" && v.amount) ctx.addIssue({ code: "custom", path: ["amount"], message: "Only bills can include an amount." });
});
const json = (v: unknown) => JSON.stringify(v);
const parse = (v: string) => { try { const x: unknown = JSON.parse(v); return x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {}; } catch { return {}; } };
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export function createStartupOperationsDesk(client: PrismaClient = prisma) {
  const storage = privateContentStorage();
  async function scope(userId: string) {
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const [company, startup] = await Promise.all([
      client.organization.findUnique({ where: { id: companyId }, select: { slug: true, type: true, status: true } }),
      client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true, name: true } }),
    ]);
    if (!company || company.slug !== "aira-skill-city" || company.type !== "COMPANY" || company.status !== "ACTIVE" || !startup || !ctx.user?.personId) throw new AccessError("Startup Skool operations are unavailable");
    const [read, submit, manage, taskRead] = await Promise.all([
      ctx.decide("startup.operations.read", { organizationId: startup.id }),
      ctx.decide("startup.operations.submit", { organizationId: startup.id }),
      ctx.decide("startup.operations.manage", { organizationId: startup.id }),
      ctx.decide("task.read", { organizationId: startup.id }),
    ]);
    if (!read.allowed && !submit.allowed && !manage.allowed) throw new AccessError("Startup Skool operations access is not authorized");
    return { userId, personId: ctx.user.personId, companyId, divisionId: startup.id, divisionName: startup.name, canRead: read.allowed || manage.allowed, canSubmit: submit.allowed || manage.allowed, canManage: manage.allowed, canReadTasks: taskRead.allowed };
  }
  async function workspace(userId: string) {
    const s = await scope(userId);
    const rows = await client.executiveRecord.findMany({
      where: { organizationId: s.divisionId, kind: "STARTUP_OPS_ITEM", ...(s.canManage ? {} : { ownerPersonId: s.personId }) },
      select: { id: true, ownerPersonId: true, title: true, status: true, payload: true, dueAt: true, version: true, createdAt: true, updatedAt: true, owner: { select: { displayName: true, email: true } }, history: { select: { actorUserId: true, fromStatus: true, toStatus: true, reason: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 30 } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }], take: 200,
    });
    const items = rows.map(row => {
      const p = parse(row.payload);
      return { id: row.id, ownerPersonId: row.ownerPersonId, owner: row.owner.displayName, ownerEmail: row.owner.email, title: row.title, status: row.status, kind: String(p.kind ?? "UPDATE"), details: String(p.details ?? ""), department: String(p.department ?? ""), state: String(p.state ?? ""), district: String(p.district ?? ""), centre: String(p.centre ?? ""), amount: String(p.amount ?? ""), attachments: Array.isArray(p.attachments) ? p.attachments.filter((id): id is string => typeof id === "string") : [], dueAt: row.dueAt, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version, history: row.history };
    });
    const now = new Date();
    const tasks = s.canReadTasks ? await client.task.findMany({ where: { organizationId: s.divisionId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, title: true, status: true, priority: true, dueDate: true, assignee: { select: { displayName: true } } }, orderBy: [{ dueDate: "asc" }, { title: "asc" }], take: 100 }) : [];
    return { ...s, items, counts: {
      total: items.length,
      attention: items.filter(i => ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "CHECKED"].includes(i.status)).length,
      overdue: items.filter(i => i.dueAt && i.dueAt < now && !["COMPLETED", "DECLINED", "FORWARDED_TO_LEADERSHIP"].includes(i.status)).length,
      reportsDue: items.filter(i => i.kind === "REPORT" && i.dueAt && i.dueAt <= now && !["COMPLETED", "DECLINED"].includes(i.status)).length,
      leadership: items.filter(i => i.status === "FORWARDED_TO_LEADERSHIP").length,
      overdueTasks: tasks.filter(t => t.dueDate && t.dueDate < now).length,
    }, tasks };
  }
  async function submit(userId: string, raw: unknown, files: readonly { name: string; type: string; bytes: Uint8Array }[] = []) {
    const s = await scope(userId); if (!s.canSubmit) throw new AccessError("You cannot submit Startup Skool operations items");
    if (files.length > 3) throw new Error("Attach up to three files.");
    const input = inputSchema.parse(raw);
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Enter a valid due date.");
    const recordId = `startup:operations:${randomUUID()}`;
    const uploaded: string[] = [];
    try {
      const savedFiles: { id: string; checked: Awaited<ReturnType<typeof validateContentFile>>; digest: string; fingerprint: string }[] = [];
      for (const file of files) {
        const checked = await validateContentFile(file.name, file.type || "application/octet-stream", file.bytes);
        if (!(checked.mediaType === "PDF" || checked.mediaType === "IMAGE") || checked.bytes > 20 * 1024 * 1024) throw new Error("Attach PDF or image files up to 20 MB each.");
        const id = randomUUID();
        const digest = hash(file.bytes);
        await storage.write(id, file.bytes); uploaded.push(id);
        savedFiles.push({ id, checked, digest, fingerprint: hash(JSON.stringify({ filename: checked.filename, mime: checked.mime, organizationId: s.divisionId, digest })) });
      }
      return await client.$transaction(async db => {
        const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
        if (!actor?.personId || actor.personId !== s.personId) throw new AccessError("Employee identity changed; sign in again.");
        for (const file of savedFiles) await db.niceJobsContentFile.create({ data: { id: file.id, companyId: s.companyId, organizationId: s.divisionId, uploaderUserId: userId, idempotencyKey: randomUUID(), fingerprint: file.fingerprint, digest: file.digest, ...file.checked } });
        const record = await db.executiveRecord.create({ data: { kind: "STARTUP_OPS_ITEM", organizationId: s.divisionId, ownerPersonId: s.personId, title: input.title, status: "SUBMITTED", sourceKey: recordId, dueAt, payload: json({ schemaVersion: 1, kind: input.kind, details: input.details, department: input.department, state: input.state, district: input.district, centre: input.centre, amount: input.kind === "BILL" ? input.amount : null, attachments: savedFiles.map(f => f.id) }) } });
        await db.executiveHistory.create({ data: { recordId: record.id, actorUserId: userId, toStatus: "SUBMITTED", reason: `${input.kind} submitted by ${input.department} for ${input.centre || `${input.district}, ${input.state}`}` } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.operations.submitted", entityType: "ExecutiveRecord", entityId: record.id, result: "SUCCESS", metadata: { itemType: input.kind, attachmentCount: savedFiles.length } });
        return record.id;
      }, { timeout: 20000 });
    } catch (error) {
      for (const id of uploaded) { const exists = await client.niceJobsContentFile.findUnique({ where: { id }, select: { id: true } }).catch(() => null); if (!exists) await storage.rollback(id).catch(() => undefined); }
      throw error;
    }
  }
  async function transition(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManage) throw new AccessError("Only the authorized AO or Startup Skool leadership can update this inbox");
    const input = z.object({ id: z.string().min(20).max(100), version: z.coerce.number().int().nonnegative(), status: z.enum(["IN_REVIEW", "NEEDS_INFO", "CHECKED", "FORWARDED_TO_LEADERSHIP", "COMPLETED", "DECLINED"]), reason: z.string().trim().min(8).max(1000) }).strict().parse(raw);
    return client.$transaction(async db => {
      const row = await db.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_OPS_ITEM" }, select: { id: true, status: true, version: true } });
      if (!row || row.version !== input.version) throw new AccessError("This item changed. Refresh before updating it.");
      if (["COMPLETED", "DECLINED", "FORWARDED_TO_LEADERSHIP"].includes(row.status)) throw new AccessError("This item is closed for AO updates.");
      if (row.status === input.status) throw new AccessError("Choose a different next step.");
      const changed = await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: s.divisionId, kind: "STARTUP_OPS_ITEM", version: row.version, status: row.status }, data: { status: input.status, version: { increment: 1 } } });
      if (changed.count !== 1) throw new AccessError("This item changed. Refresh before updating it.");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: input.status, reason: input.reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.operations.status_changed", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { from: row.status, to: input.status } });
      return row.id;
    });
  }
  async function attachment(userId: string, itemId: string, fileId: string) {
    const s = await scope(userId);
    const record = await client.executiveRecord.findFirst({ where: { id: itemId, organizationId: s.divisionId, kind: "STARTUP_OPS_ITEM", ...(s.canManage ? {} : { ownerPersonId: s.personId }) }, select: { payload: true } });
    if (!record || !((parse(record.payload).attachments as unknown[] | undefined) ?? []).includes(fileId)) throw new AccessError("Attachment unavailable");
    const file = await client.niceJobsContentFile.findFirst({ where: { id: fileId, companyId: s.companyId, organizationId: s.divisionId } });
    if (!file) throw new AccessError("Attachment unavailable");
    const bytes = await storage.read(file.id);
    if (bytes.length !== file.bytes || hash(bytes) !== file.digest) throw new Error("Attachment integrity check failed");
    await operationalEvent(client, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.operations.attachment_accessed", entityType: "ExecutiveRecord", entityId: itemId, result: "SUCCESS", metadata: { fileId } });
    return { file, bytes };
  }
  return { workspace, submit, transition, attachment };
}
export const startupOperationsDesk = createStartupOperationsDesk();
