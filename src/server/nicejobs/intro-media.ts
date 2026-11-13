import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { niceJobsControlPanel } from "./control-panel";
import { contentFiles } from "./content-files";
import { creditedPlaybackSeconds, isValidPublishedIntroduction, playbackCompletionAllowed } from "./intro-media-rules";

const languageCode = z.string().trim().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/).max(12);
const languageName = z.string().trim().min(2).max(60);
const mediaType = z.enum(["AUDIO", "VIDEO"]);
const draftInput = z.object({ languageCode, title: z.string().trim().min(3).max(100), mediaType, mediaFileId: z.string().uuid(), thumbnailFileId: z.string().uuid(), durationSeconds: z.number().int().min(3).max(1800) }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function createNiceJobsIntroMedia(client: PrismaClient = prisma) {
  async function scope() {
    const company = await client.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } });
    const division = await client.organization.findUnique({ where: { slug: "aira-career-hub" }, select: { id: true, parentId: true, parent: { select: { slug: true } } } });
    if (!company || division?.parentId !== company.id || division.parent?.slug !== "aira-skill-city") throw new AccessError("NICEJOBS company scope is unavailable");
    return { companyId: company.id, divisionId: division.id };
  }
  async function boss(userId: string) {
    const s = await scope();
    const nav = await niceJobsControlPanel.navigation(userId, { divisionId: s.divisionId });
    if (nav.companyId !== s.companyId || !nav.groups.some(group => group.key === "reports" && group.entries.some(entry => entry.view === "boss-system"))) throw new AccessError("Boss permission required");
    await contentFiles.preflight(userId, s.divisionId);
    return s;
  }
  async function file(userId: string, s: Awaited<ReturnType<typeof scope>>, id: string, expected: "AUDIO" | "VIDEO" | "IMAGE") {
    const authorized = await contentFiles.authorize(userId, s.divisionId, id);
    if (authorized.mediaType !== expected || expected === "AUDIO" && !/^audio\//i.test(authorized.mimeType) || expected === "VIDEO" && !/^video\//i.test(authorized.mimeType) || expected === "IMAGE" && !/^image\//i.test(authorized.mimeType)) throw new AccessError(`Choose an uploaded ${expected.toLowerCase()} file`);
    return authorized;
  }
  async function listForBoss(userId: string) {
    const s = await boss(userId);
    const items = await client.niceJobsPortalIntroduction.findMany({ where: { companyId: s.companyId }, orderBy: [{ languageName: "asc" }], select: { id: true, languageCode: true, languageName: true, title: true, draftAudioFileId: true, draftAudioThumbnailFileId: true, draftAudioDurationSeconds: true, draftVideoFileId: true, draftVideoThumbnailFileId: true, draftVideoDurationSeconds: true, publishedMediaType: true, publishedMediaFileId: true, publishedThumbnailFileId: true, publishedDurationSeconds: true, publishedAt: true } });
    return { items, organizationId: s.divisionId };
  }
  async function addLanguage(userId: string, raw: unknown) {
    const s = await boss(userId), data = z.object({ code: languageCode, name: languageName }).strict().parse(raw), code = data.code.toLowerCase();
    const duplicate = await client.niceJobsPortalIntroduction.findFirst({ where: { companyId: s.companyId, OR: [{ languageCode: code }, { languageName: { equals: data.name, mode: "insensitive" } }] }, select: { id: true } });
    if (duplicate) throw new AccessError("That language or display name is already configured");
    const created = await client.niceJobsPortalIntroduction.create({ data: { id: randomUUID(), companyId: s.companyId, languageCode: code, languageName: data.name, updatedByUserId: userId } });
    await client.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, organizationId: s.companyId, action: "nicejobs.intro_language.created", entityType: "NiceJobsPortalIntroduction", entityId: created.id, result: "SUCCESS", metadata: { languageCode: code, languageName: data.name } }) });
    return created;
  }
  async function saveDraft(userId: string, raw: unknown) {
    const s = await boss(userId), data = draftInput.parse(raw), code = data.languageCode.toLowerCase();
    const [media, thumbnail, language] = await Promise.all([file(userId, s, data.mediaFileId, data.mediaType), file(userId, s, data.thumbnailFileId, "IMAGE"), client.niceJobsPortalIntroduction.findUnique({ where: { companyId_languageCode: { companyId: s.companyId, languageCode: code } } })]);
    if (!language) throw new AccessError("Add this language before preparing its introduction");
    const draft = data.mediaType === "AUDIO" ? { draftAudioFileId: media.privateHandle, draftAudioThumbnailFileId: thumbnail.privateHandle, draftAudioDurationSeconds: data.durationSeconds } : { draftVideoFileId: media.privateHandle, draftVideoThumbnailFileId: thumbnail.privateHandle, draftVideoDurationSeconds: data.durationSeconds };
    const updated = await client.niceJobsPortalIntroduction.update({ where: { id: language.id }, data: { title: data.title, ...draft, updatedByUserId: userId } });
    await client.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, organizationId: s.companyId, action: "nicejobs.intro_media.draft_saved", entityType: "NiceJobsPortalIntroduction", entityId: updated.id, result: "SUCCESS", metadata: { languageCode: code, mediaType: data.mediaType, durationSeconds: data.durationSeconds } }) });
    return updated;
  }
  async function publish(userId: string, codeRaw: string, mediaTypeRaw: unknown) {
    const s = await boss(userId), code = languageCode.parse(codeRaw).toLowerCase(), selectedType = mediaType.parse(mediaTypeRaw);
    const result = await client.$transaction(async db => {
      const row = await db.niceJobsPortalIntroduction.findUnique({ where: { companyId_languageCode: { companyId: s.companyId, languageCode: code } } });
      const draftMediaId = selectedType === "AUDIO" ? row?.draftAudioFileId : row?.draftVideoFileId;
      const draftThumbnailId = selectedType === "AUDIO" ? row?.draftAudioThumbnailFileId : row?.draftVideoThumbnailFileId;
      const draftDuration = selectedType === "AUDIO" ? row?.draftAudioDurationSeconds : row?.draftVideoDurationSeconds;
      if (!row || !draftMediaId || !draftThumbnailId || !draftDuration) throw new AccessError("Save a complete draft of the selected media type and thumbnail first");
      const [media, thumbnail] = await Promise.all([db.niceJobsContentFile.findFirst({ where: { id: draftMediaId, companyId: s.companyId, organizationId: s.divisionId } }), db.niceJobsContentFile.findFirst({ where: { id: draftThumbnailId, companyId: s.companyId, organizationId: s.divisionId } })]);
      if (!media || media.mediaType !== selectedType || !thumbnail || thumbnail.mediaType !== "IMAGE") throw new AccessError("Draft media is no longer valid");
      await Promise.all([contentFiles.readStoredFile(media.id), contentFiles.readStoredFile(thumbnail.id)]);
      const updated = await db.niceJobsPortalIntroduction.update({ where: { id: row.id }, data: { publishedMediaFileId: media.id, publishedMediaType: selectedType, publishedThumbnailFileId: thumbnail.id, publishedDurationSeconds: draftDuration, publishedAt: new Date(), updatedByUserId: userId } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, organizationId: s.companyId, action: "nicejobs.intro_media.published", entityType: "NiceJobsPortalIntroduction", entityId: row.id, result: "SUCCESS", metadata: { languageCode: code, mediaType: updated.publishedMediaType, fileId: updated.publishedMediaFileId } }) });
      return updated;
    });
    return result;
  }
  async function unpublish(userId: string, codeRaw: string) {
    const s = await boss(userId), code = languageCode.parse(codeRaw).toLowerCase();
    return client.$transaction(async db => {
      const row = await db.niceJobsPortalIntroduction.findUnique({ where: { companyId_languageCode: { companyId: s.companyId, languageCode: code } } });
      if (!row) throw new AccessError("Language not found");
      const updated = await db.niceJobsPortalIntroduction.update({ where: { id: row.id }, data: { publishedAt: null, updatedByUserId: userId } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, organizationId: s.companyId, action: "nicejobs.intro_media.unpublished", entityType: "NiceJobsPortalIntroduction", entityId: row.id, result: "SUCCESS", metadata: { languageCode: code } }) });
      return updated;
    });
  }
  async function published() {
    const s = await scope();
    const rows = await client.niceJobsPortalIntroduction.findMany({ where: { companyId: s.companyId, publishedAt: { not: null }, publishedMediaFileId: { not: null }, publishedMediaType: { in: ["AUDIO", "VIDEO"] }, publishedDurationSeconds: { gte: 3 } }, orderBy: [{ languageName: "asc" }], select: { languageCode: true, languageName: true, title: true, publishedMediaType: true, publishedMediaFileId: true, publishedThumbnailFileId: true, publishedDurationSeconds: true, publishedAt: true } });
    const valid = [];
    for (const row of rows) {
      const [media, thumb] = await Promise.all([client.niceJobsContentFile.findFirst({ where: { id: row.publishedMediaFileId!, companyId: s.companyId, organizationId: s.divisionId } }), row.publishedThumbnailFileId ? client.niceJobsContentFile.findFirst({ where: { id: row.publishedThumbnailFileId, companyId: s.companyId, organizationId: s.divisionId } }) : Promise.resolve(null)]);
      if (!media || !isValidPublishedIntroduction(row, media.mediaType, thumb?.mediaType ?? null)) continue;
      try { await Promise.all([contentFiles.readStoredFile(media.id), ...(thumb ? [contentFiles.readStoredFile(thumb.id)] : [])]); } catch { continue; }
      valid.push({ languageCode: row.languageCode, languageName: row.languageName, title: row.title || "Introduction to NICEJOBS", mediaType: row.publishedMediaType, durationSeconds: row.publishedDurationSeconds!, hasThumbnail: Boolean(thumb) });
    }
    return valid;
  }
  async function publicFile(codeRaw: string, asset: "media" | "thumbnail") {
    const code = languageCode.parse(codeRaw).toLowerCase(), s = await scope();
    const row = await client.niceJobsPortalIntroduction.findFirst({ where: { companyId: s.companyId, languageCode: code, publishedAt: { not: null } } });
    if (!row) return null;
    if (!row.publishedMediaFileId) return null;
    const [media, thumbnail] = await Promise.all([client.niceJobsContentFile.findFirst({ where: { id: row.publishedMediaFileId, companyId: s.companyId, organizationId: s.divisionId } }), row.publishedThumbnailFileId ? client.niceJobsContentFile.findFirst({ where: { id: row.publishedThumbnailFileId, companyId: s.companyId, organizationId: s.divisionId } }) : Promise.resolve(null)]);
    if (!media || !isValidPublishedIntroduction(row, media.mediaType, thumbnail?.mediaType ?? null) || asset === "thumbnail" && !thumbnail) return null;
    const result = await contentFiles.readStoredFile(asset === "media" ? media.id : thumbnail!.id);
    return result;
  }
  async function draftFile(userId: string, codeRaw: string, asset: "audio" | "video" | "audio-thumbnail" | "video-thumbnail") {
    const s = await boss(userId), code = languageCode.parse(codeRaw).toLowerCase();
    const row = await client.niceJobsPortalIntroduction.findUnique({ where: { companyId_languageCode: { companyId: s.companyId, languageCode: code } } });
    const audio = asset.startsWith("audio"), thumbnail = asset.endsWith("thumbnail");
    const id = thumbnail ? audio ? row?.draftAudioThumbnailFileId : row?.draftVideoThumbnailFileId : audio ? row?.draftAudioFileId : row?.draftVideoFileId;
    if (!id) return null;
    const result = await contentFiles.readStoredFile(id);
    const expected = thumbnail ? "IMAGE" : audio ? "AUDIO" : "VIDEO";
    if (result.file.companyId !== s.companyId || result.file.organizationId !== s.divisionId || result.file.mediaType !== expected) return null;
    return result;
  }
  async function startSession(codeRaw: string) {
    const code = languageCode.parse(codeRaw).toLowerCase(), s = await scope();
    if (!(await published()).some(item => item.languageCode === code)) throw new AccessError("Published introduction unavailable");
    const intro = await client.niceJobsPortalIntroduction.findFirst({ where: { companyId: s.companyId, languageCode: code, publishedAt: { not: null } } });
    if (!intro?.publishedMediaFileId || !intro.publishedDurationSeconds || !intro.publishedMediaType) throw new AccessError("Published introduction unavailable");
    const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 30 * 60_000);
    const session = await client.niceJobsIntroPlaybackSession.create({ data: { id: randomUUID(), tokenHash: hash(token), languageCode: code, mediaFileId: intro.publishedMediaFileId, durationSeconds: intro.publishedDurationSeconds, expiresAt } });
    return { token, sessionId: session.id, durationSeconds: session.durationSeconds, mediaFileId: session.mediaFileId };
  }
  async function playbackHeartbeat(token: string, statusRaw: unknown, positionRaw: unknown) {
    const status = z.enum(["PLAYING", "PAUSED", "ENDED", "ABANDONED"]).parse(statusRaw), position = z.number().finite().min(0).max(1800).parse(positionRaw);
    return client.$transaction(async db => {
      const row = await db.niceJobsIntroPlaybackSession.findUnique({ where: { tokenHash: hash(token) } });
      if (!row || row.expiresAt < new Date() || row.completedAt) return { complete: false };
      const now = new Date(), elapsed = Math.max(0, Math.min(8, (now.getTime() - row.lastHeartbeatAt.getTime()) / 1000));
      let credited = row.creditedSeconds;
      if (row.status === "PLAYING" && status === "PLAYING") credited += creditedPlaybackSeconds(elapsed, position - row.lastPositionSeconds);
      else if (row.status === "PLAYING" && status === "PAUSED") credited += creditedPlaybackSeconds(elapsed, position - row.lastPositionSeconds);
      if (status === "ENDED") {
        const advance = position - row.lastPositionSeconds;
        if (row.status === "PLAYING" && elapsed <= 6 && advance >= 0 && advance <= elapsed * 1.5 + 1) credited += Math.floor(Math.min(elapsed, advance));
        const complete = playbackCompletionAllowed(row.durationSeconds, credited, position);
        await db.niceJobsIntroPlaybackSession.update({ where: { id: row.id }, data: { status: complete ? "COMPLETED" : "ABANDONED", creditedSeconds: credited, lastPositionSeconds: position, lastHeartbeatAt: now, completedAt: complete ? now : null } });
        return { complete, sessionId: row.id, languageCode: row.languageCode };
      }
      await db.niceJobsIntroPlaybackSession.update({ where: { id: row.id }, data: { status, creditedSeconds: credited, lastPositionSeconds: position, lastHeartbeatAt: now } });
      return { complete: false };
    });
  }
  return { listForBoss, addLanguage, saveDraft, publish, unpublish, published, publicFile, draftFile, startSession, playbackHeartbeat, hash };
}
export const niceJobsIntroMedia = createNiceJobsIntroMedia();
