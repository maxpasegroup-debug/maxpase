import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { createBossService } from "./boss-service";
import { operationalEvent } from "@/server/domain/operational-events";
import { hrCloudinary, HrStorageUnavailable } from "./hr-cloudinary";

export const defaultHrCategories = [
  ["PROFILE_PHOTO", "Profile photograph"], ["IDENTITY", "Identity documents"], ["TAX", "PAN and tax documents"],
  ["RESUME", "Resume / CV"], ["EDUCATION", "Educational certificates"], ["EXPERIENCE", "Experience certificates"],
  ["APPOINTMENT", "Appointment letters"], ["AGREEMENT", "Employment agreements"], ["OTHER", "Other HR documents"]
] as const;
const id = z.string().min(1).max(200);
const category = z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/);
const uploadInput = z.object({ employmentId: id, brandId: id.optional(), categoryKey: category, title: z.string().trim().min(2).max(160), filename: z.string().trim().min(1).max(160), replacesId: id.optional() }).strict();
const maxBytes = 10 * 1024 * 1024;
function verifiedFile(bytes: Uint8Array, filename: string) {
  if (!bytes.length || bytes.length > maxBytes || filename.includes("/") || filename.includes("\\") || [...filename].some(char => char.charCodeAt(0) < 32)) throw new AccessError("Choose a PDF, JPEG, PNG or WebP file up to 10 MB");
  const extension = filename.split(".").at(-1)?.toLowerCase();
  const starts = (prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  if (extension === "pdf" && starts([0x25,0x50,0x44,0x46,0x2d])) return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") if (starts([0xff,0xd8,0xff])) return "image/jpeg";
  if (extension === "png" && starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return "image/png";
  if (extension === "webp" && starts([0x52,0x49,0x46,0x46]) && Buffer.from(bytes.subarray(8,12)).toString() === "WEBP") return "image/webp";
  throw new AccessError("Choose a PDF, JPEG, PNG or WebP file up to 10 MB");
}

export function createHrDocuments(client: PrismaClient = prisma, storage = hrCloudinary()) {
  const boss = createBossService(client);
  async function scope(db: Prisma.TransactionClient, actorId: string, companyId: string, brandId: string | null, manage: boolean) {
    const company = await db.organization.findUnique({ where: { id: companyId }, select: { id: true, type: true, parentId: true } });
    if (!company || company.type !== "COMPANY") throw new AccessError("Document scope unavailable");
    const brand = brandId ? await db.brand.findFirst({ where: { id: brandId, organizationId: companyId }, select: { id: true, slug: true } }) : null;
    if (brandId && !brand) throw new AccessError("Document scope unavailable");
    try {
      const { root, ctx } = await boss.authority(actorId, db);
      if (company.parentId === root.id) {
        await ctx.requireAccess(manage ? "person.update" : "person.read", { organizationId: companyId });
        return ctx;
      }
    } catch (error) { if (!(error instanceof AccessError)) throw error; }
    const ctx = await createAccessContext(actorId, db, undefined, { organizationId: companyId });
    const key = manage ? "hr.document.manage" : "hr.document.read";
    if ((await ctx.decide(key, { organizationId: companyId })).allowed) return ctx;
    if (brand) {
      const division = await db.organization.findFirst({ where: { slug: brand.slug, parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
      if (division && (await ctx.decide(key, { organizationId: division.id })).allowed) return ctx;
    }
    throw new AccessError("Document unavailable for this account");
  }
  async function employment(db: Prisma.TransactionClient, employmentId: string) {
    const row = await db.employment.findUnique({ where: { id: employmentId }, select: { id: true, companyId: true, personId: true, status: true } });
    if (!row) throw new AccessError("Employee unavailable");
    return row;
  }
  async function preflight(actorId: string, employmentId: string, brandId?: string) {
    const worker = await employment(client, employmentId);
    await scope(client, actorId, worker.companyId, brandId ?? null, true);
    if (worker.status === "ENDED") throw new AccessError("Employment has ended");
    if (brandId && !(await client.hrAssignment.findFirst({ where: { employmentId, brandId, status: "ACTIVE" } }))) throw new AccessError("Active brand assignment required");
  }
  async function categories(actorId: string, companyId: string) {
    await scope(client, actorId, companyId, null, false);
    const configured = await client.hrDocumentCategory.findMany({ where: { companyId, active: true }, select: { key: true, label: true }, orderBy: { label: "asc" }, take: 100 });
    return [...defaultHrCategories.map(([key,label]) => ({ key, label })), ...configured];
  }
  async function addCategory(actorId: string, raw: unknown) {
    const input = z.object({ companyId: id, key: category, label: z.string().trim().min(2).max(100) }).strict().parse(raw);
    if (defaultHrCategories.some(([key]) => key === input.key)) throw new AccessError("Category already exists");
    return client.$transaction(async db => {
      const { ctx, root } = await boss.authority(actorId, db);
      const company = await db.organization.findFirst({ where: { id: input.companyId, parentId: root.id, type: "COMPANY" }, select: { id: true } });
      if (!company) throw new AccessError("Company unavailable");
      await ctx.requireAccess("person.update", { organizationId: input.companyId });
      const row = await db.hrDocumentCategory.create({ data: input });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: input.companyId, action: "hr.document_category_created", entityType: "HrDocumentCategory", entityId: row.id, result: "SUCCESS" });
      return row;
    });
  }
  async function list(actorId: string, employmentId: string, filter: { categoryKey?: string; search?: string } = {}) {
    const row = await employment(client, employmentId);
    let authorized = false;
    try { await scope(client, actorId, row.companyId, null, false); authorized = true; }
    catch (error) { if (!(error instanceof AccessError)) throw error; }
    if (!authorized) {
      const brandIds = await client.hrAssignment.findMany({ where: { employmentId }, select: { brandId: true }, distinct: ["brandId"], take: 100 });
      for (const brand of brandIds) {
        try { await scope(client, actorId, row.companyId, brand.brandId, false); authorized = true; break; }
        catch (error) { if (!(error instanceof AccessError)) throw error; }
      }
    }
    if (!authorized) throw new AccessError("Document unavailable for this account");
    const all = await client.hrDocument.findMany({ where: { employmentId, ...(filter.categoryKey ? { categoryKey: filter.categoryKey } : {}), ...(filter.search ? { title: { contains: filter.search.slice(0,100), mode: "insensitive" } } : {}) }, select: { id: true, companyId: true, brandId: true, categoryKey: true, title: true, filename: true, mime: true, bytes: true, status: true, employeeVisible: true, replacesId: true, uploaderUserId: true, createdAt: true, archivedAt: true, brand: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    const visible = [];
    for (const doc of all) {
      try { await scope(client, actorId, row.companyId, doc.brandId, false); visible.push(doc); }
      catch (error) { if (!(error instanceof AccessError)) throw error; }
    }
    return visible;
  }
  async function upload(actorId: string, raw: unknown, bytes: Uint8Array) {
    const input = uploadInput.parse(raw), mime = verifiedFile(bytes, input.filename);
    if (!storage.configured()) throw new HrStorageUnavailable("Private document storage is not configured");
    const pending = await client.$transaction(async db => {
      const worker = await employment(db, input.employmentId);
      const ctx = await scope(db, actorId, worker.companyId, input.brandId ?? null, true);
      if (worker.status === "ENDED") throw new AccessError("Employment has ended");
      if (input.brandId && !(await db.hrAssignment.findFirst({ where: { employmentId: worker.id, brandId: input.brandId, status: "ACTIVE" } }))) throw new AccessError("Active brand assignment required");
      if (!defaultHrCategories.some(([key]) => key === input.categoryKey) && !(await db.hrDocumentCategory.findFirst({ where: { companyId: worker.companyId, key: input.categoryKey, active: true } }))) throw new AccessError("Document category unavailable");
      if (input.replacesId) {
        const old = await db.hrDocument.findFirst({ where: { id: input.replacesId, employmentId: worker.id, brandId: input.brandId ?? null, categoryKey: input.categoryKey, status: "ACTIVE" } });
        if (!old) throw new AccessError("Replacement document unavailable");
      }
      const fileId = randomUUID(), publicId = `maxpase/hr/${fileId}`;
      const doc = await db.hrDocument.create({ data: { id: fileId, employmentId: worker.id, companyId: worker.companyId, brandId: input.brandId ?? null, categoryKey: input.categoryKey, title: input.title, filename: input.filename, mime, bytes: bytes.length, publicId, uploaderUserId: actorId } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: worker.companyId, action: "hr.document_upload_started", entityType: "HrDocument", entityId: doc.id, result: "SUCCESS" });
      return doc;
    });
    try {
      const asset = await storage.upload(pending.publicId, bytes, input.filename, mime);
      await client.$transaction(async db => {
        const worker = await employment(db, input.employmentId);
        const ctx = await scope(db, actorId, worker.companyId, input.brandId ?? null, true);
        if (input.replacesId) {
          const changed = await db.hrDocument.updateMany({ where: { id: input.replacesId, employmentId: worker.id, status: "ACTIVE", brandId: input.brandId ?? null }, data: { status: "REPLACED" } });
          if (changed.count !== 1) throw new AccessError("Replacement changed; uploaded asset needs reconciliation");
        }
        const changed = await db.hrDocument.updateMany({ where: { id: pending.id, status: "UPLOADING" }, data: { status: "ACTIVE", assetId: asset.assetId, resourceType: asset.resourceType, format: asset.format, replacesId: input.replacesId ?? null } });
        if (changed.count !== 1) throw new AccessError("Upload state changed");
        await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: worker.companyId, action: input.replacesId ? "hr.document_replaced" : "hr.document_uploaded", entityType: "HrDocument", entityId: pending.id, result: "SUCCESS", metadata: { replacesId: input.replacesId ?? null } });
      });
      return pending.id;
    } catch (error) {
      await client.$transaction(async db => {
        await db.hrDocument.updateMany({ where: { id: pending.id, status: "UPLOADING" }, data: { status: "FAILED" } });
        await operationalEvent(db, { actorUserId: actorId, organizationId: pending.companyId, action: "hr.document_upload_failed", entityType: "HrDocument", entityId: pending.id, result: "FAILURE" });
      });
      throw error;
    }
  }
  async function archive(actorId: string, documentId: string) {
    return client.$transaction(async db => {
      const doc = await db.hrDocument.findUnique({ where: { id: documentId } });
      if (!doc) throw new AccessError("Document unavailable");
      const ctx = await scope(db, actorId, doc.companyId, doc.brandId, true);
      const changed = await db.hrDocument.updateMany({ where: { id: doc.id, status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      if (changed.count !== 1) throw new AccessError("Document already changed");
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: doc.companyId, action: "hr.document_archived", entityType: "HrDocument", entityId: doc.id, result: "SUCCESS" });
    });
  }
  async function download(actorId: string, documentId: string) {
    const doc = await client.hrDocument.findUnique({ where: { id: documentId } });
    if (!doc || !doc.assetId || doc.status === "UPLOADING" || doc.status === "FAILED") throw new AccessError("Document unavailable");
    await scope(client, actorId, doc.companyId, doc.brandId, false);
    const bytes = await storage.download(doc.assetId, doc.bytes);
    await client.$transaction(async db => {
      const latest = await db.hrDocument.findUnique({ where: { id: doc.id } });
      if (!latest || latest.status !== doc.status || latest.assetId !== doc.assetId) throw new AccessError("Document changed");
      const ctx = await scope(db, actorId, doc.companyId, doc.brandId, false);
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: doc.companyId, action: "hr.document_accessed", entityType: "HrDocument", entityId: doc.id, result: "SUCCESS" });
    });
    return { bytes, filename: doc.filename, mime: doc.mime };
  }
  async function history(actorId: string, documentId: string) {
    const doc = await client.hrDocument.findUnique({ where: { id: documentId }, select: { companyId: true, brandId: true } });
    if (!doc) throw new AccessError("Document unavailable");
    await scope(client, actorId, doc.companyId, doc.brandId, false);
    return client.operationalEvent.findMany({ where: { entityType: "HrDocument", entityId: documentId, organizationId: doc.companyId }, select: { eventType: true, actor: { select: { email: true } }, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
  }
  async function setEmployeeVisibility(actorId: string, documentId: string, visible: boolean) {
    return client.$transaction(async db => {
      const doc = await db.hrDocument.findUnique({ where: { id: documentId } });
      if (!doc || doc.status !== "ACTIVE") throw new AccessError("Active document required");
      const ctx = await scope(db, actorId, doc.companyId, doc.brandId, true);
      if (visible && !(await db.employment.findFirst({ where: { id: doc.employmentId, status: "ACTIVE" } }))) throw new AccessError("Active employment required");
      await db.hrDocument.update({ where: { id: doc.id }, data: { employeeVisible: visible } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: doc.companyId, action: visible ? "hr.document_shared_with_employee" : "hr.document_employee_access_removed", entityType: "HrDocument", entityId: doc.id, result: "SUCCESS" });
    });
  }
  async function selfDocuments(userId: string) {
    const user = await client.user.findUnique({ where: { id: userId }, select: { personId: true, status: true } });
    if (!user?.personId || user.status !== "ACTIVE") throw new AccessError("Employee account unavailable");
    const employment = await client.employment.findMany({ where: { personId: user.personId, status: "ACTIVE", company: { slug: "aira-skill-city", status: "ACTIVE" } }, select: { id: true, companyId: true, assignments: { where: { status: "ACTIVE", brand: { status: "ACTIVE" } }, select: { brandId: true } } }, take: 20 });
    return client.hrDocument.findMany({ where: { employeeVisible: true, status: "ACTIVE", employmentId: { in: employment.map(row => row.id) }, OR: [{ brandId: null }, ...employment.flatMap(row => row.assignments.map(assignment => ({ employmentId: row.id, brandId: assignment.brandId })))] }, select: { id: true, title: true, filename: true, categoryKey: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
  }
  async function selfDownload(userId: string, documentId: string) {
    const document = await client.hrDocument.findUnique({ where: { id: documentId } });
    if (!document?.assetId || document.status !== "ACTIVE" || !document.employeeVisible) throw new AccessError("Document unavailable");
    const user = await client.user.findUnique({ where: { id: userId }, select: { personId: true, status: true } });
    if (!user?.personId || user.status !== "ACTIVE") throw new AccessError("Document unavailable");
    const employment = await client.employment.findFirst({ where: { id: document.employmentId, personId: user.personId, companyId: document.companyId, status: "ACTIVE", company: { slug: "aira-skill-city", status: "ACTIVE" }, ...(document.brandId ? { assignments: { some: { brandId: document.brandId, status: "ACTIVE", brand: { status: "ACTIVE" } } } } : {}) }, select: { id: true } });
    if (!employment) throw new AccessError("Document unavailable");
    const bytes = await storage.download(document.assetId, document.bytes);
    await client.$transaction(async db => {
      const latest = await db.hrDocument.findFirst({ where: { id: document.id, status: "ACTIVE", employeeVisible: true, assetId: document.assetId, employment: { personId: user.personId!, companyId: document.companyId, status: "ACTIVE", company: { slug: "aira-skill-city", status: "ACTIVE" }, ...(document.brandId ? { assignments: { some: { brandId: document.brandId, status: "ACTIVE", brand: { status: "ACTIVE" } } } } : {}) } } });
      if (!latest) throw new AccessError("Document unavailable");
      await operationalEvent(db, { actorUserId: userId, actorPersonId: user.personId!, organizationId: document.companyId, action: "hr.document_employee_downloaded", entityType: "HrDocument", entityId: document.id, result: "SUCCESS" });
    });
    return { bytes, filename: document.filename, mime: document.mime };
  }
  return { categories, addCategory, list, upload, preflight, archive, download, history, setEmployeeVisibility, selfDocuments, selfDownload, configured: storage.configured };
}
export const hrDocuments = createHrDocuments();
