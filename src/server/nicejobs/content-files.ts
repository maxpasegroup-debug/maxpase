import { createHash, randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createEmployeeService } from "./employee";
import { privateContentStorage, type ContentStorage, ContentStorageUnavailable } from "./content-storage";
import { validateContentFile } from "./content-validation";
import { NiceJobsError } from "./input";
import { workerKnowledgeWhere } from "./knowledge-access";
import { createOnboardingService } from "./onboarding";
import { linkedTrainingResource } from "./training-resource";

const uploadInput = z.object({ organizationId: z.string().min(1).max(120), idempotencyKey: z.string().uuid(), filename: z.string().min(1).max(180), mime: z.string().max(100) }).strict();
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export function createContentFiles(client: PrismaClient = prisma, storage: ContentStorage = privateContentStorage()) {
  const employee = createEmployeeService(client).internal;
  async function authority(db: Prisma.TransactionClient, userId: string, organizationId: string, manage = true) {
    const b = await employee.boundary(db, userId);
    if (organizationId !== b.company.id && !b.ctx.nodes.some(node => node.id === organizationId && node.parentId === b.company.id && node.status === "ACTIVE")) throw new AccessError("Content scope unavailable");
    await b.ctx.requireAccess("nicejobs.knowledge.read", { organizationId });
    if (manage) await b.ctx.requireAccess("nicejobs.knowledge.manage", { organizationId });
    return b;
  }
  async function authorizeIn(db: Prisma.TransactionClient, userId: string, organizationId: string, id: string, mediaType?: string, attach = true) {
    z.string().uuid().parse(id);
    const b = await authority(db, userId, organizationId, attach);
    const file = await db.niceJobsContentFile.findFirst({ where: { id, companyId: b.company.id, organizationId } });
    if (!file || mediaType && mediaType !== "CUSTOMER_MATERIAL" && file.mediaType !== mediaType) throw new AccessError("Uploaded file must belong to this scope and match the resource type");
    await readData(file);
    return file;
  }
  async function upload(userId: string, raw: unknown, bytes: Uint8Array) {
    const c = uploadInput.parse(raw);
    await client.$transaction(db => authority(db, userId, c.organizationId));
    const validated = await validateContentFile(c.filename, c.mime, bytes), digest = hash(bytes);
    const fingerprint = hash(JSON.stringify({ ...validated, organizationId: c.organizationId, digest }));
    const id = randomUUID(); let written = false;
    try {
      return await client.$transaction(async db => {
        const b = await authority(db, userId, c.organizationId);
        const prior = await db.niceJobsContentFile.findUnique({ where: { uploaderUserId_idempotencyKey: { uploaderUserId: userId, idempotencyKey: c.idempotencyKey } } });
        if (prior) { if (prior.fingerprint !== fingerprint) throw new NiceJobsError("Upload retry does not match the original file"); await readData(prior); return prior; }
        const totals = await db.niceJobsContentFile.aggregate({ where: { companyId: b.company.id }, _sum: { bytes: true }, _count: true });
        if ((totals._sum.bytes ?? 0) + bytes.byteLength > 10 * 1024 ** 3 || totals._count >= 10000) throw new NiceJobsError("Content storage quota reached; contact the administrator");
        await storage.write(id, bytes); written = true;
        const file = await db.niceJobsContentFile.create({ data: { id, companyId: b.company.id, organizationId: c.organizationId, uploaderUserId: userId, idempotencyKey: c.idempotencyKey, fingerprint, digest, ...validated } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: c.organizationId, action: "nicejobs.content.uploaded", entityType: "NiceJobsContentFile", entityId: id, result: "SUCCESS", metadata: { bytes: file.bytes, mime: file.mime, digest } });
        return file;
      }, { timeout: 20000 });
    } catch (error) {
      if (written) {
        const committed = await client.niceJobsContentFile.findUnique({ where: { id } });
        if (!committed) await storage.rollback(id);
      }
      throw error;
    }
  }
  async function readData(file: { id: string; bytes: number; digest: string }) {
    const bytes = await storage.read(file.id);
    if (bytes.length !== file.bytes || hash(bytes) !== file.digest) throw new ContentStorageUnavailable("Stored file integrity check failed");
    return bytes;
  }
  async function download(userId: string, versionId: string, management = false, applicationReference?: string) {
    return client.$transaction(async db => {
      const b = await employee.boundary(db, userId);
      const version = await db.niceJobsKnowledgeVersion.findFirst({ where: { id: versionId, content: { companyId: b.company.id, kind: "RESOURCE" } }, include: { content: true } });
      if (!version?.privateReference) throw new AccessError("File unavailable");
      if (applicationReference) {
        if (management) throw new AccessError("Invalid training access mode");
        z.string().uuid().parse(applicationReference);
        const training = createOnboardingService(client).internal, ctx = await training.boundary(db,userId,true), enrollment = await training.load(db,ctx,applicationReference,true);
        await linkedTrainingResource(db,enrollment,versionId);
      } else if (management) await authority(db, userId, version.organizationId, false);
      else {
        const assignment = await employee.own(db, b);
        if (!await db.niceJobsKnowledgeVersion.findFirst({ where: { AND: [workerKnowledgeWhere(b.ctx, assignment, b.company.id, "RESOURCE", new Date()), { id: versionId }] }, select: { id: true } })) throw new AccessError("File unavailable");
      }
      const file = await db.niceJobsContentFile.findFirst({ where: { id: version.privateReference, companyId: b.company.id, organizationId: version.organizationId } });
      if (!file) throw new AccessError("File unavailable");
      const bytes = await readData(file);
      await operationalEvent(db, { actorUserId: userId, actorPersonId: b.personId, organizationId: version.organizationId, action: "nicejobs.content.accessed", entityType: "NiceJobsKnowledgeVersion", entityId: version.id, result: "SUCCESS", metadata: { fileId: file.id, version: version.number, management } });
      return { file, bytes };
    }, { timeout: 20000 });
  }
  return { upload, authorizeIn, download, storage, async preflight(userId: string, organizationId: string) { return client.$transaction(db => authority(db, userId, organizationId)); }, async authorize(userId: string, organizationId: string, id: string) { const file = await client.$transaction(db => authorizeIn(db, userId, organizationId, id)); return { privateHandle: file.id, mimeType: file.mime, filename: file.filename }; } };
}
export const contentFiles = createContentFiles();
