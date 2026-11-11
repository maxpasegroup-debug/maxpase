import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { AccessError } from "@/server/authorization/engine";
import { niceJobsControlPanel } from "./control-panel";
import { contentFiles } from "./content-files";

const videoInput = z.object({
  title: z.string().trim().min(3).max(100),
  fileId: z.string().uuid()
}).strict();

export function createNiceJobsPortalSettings(client: PrismaClient = prisma) {
  async function introVideo() {
    const [company, career] = await Promise.all([
      client.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true } }),
      client.organization.findUnique({ where: { slug: "aira-career-hub" }, select: { id: true, parent: { select: { slug: true } } } })
    ]);
    if (!company || career?.parent?.slug !== "aira-skill-city") return null;
    const setting = await client.niceJobsPortalSetting.findFirst({ where: { id: "nice-jobs", companyId: company.id }, select: { introVideoTitle: true, introVideoFileId: true } });
    return { title: setting?.introVideoTitle ?? "What is NICEJOBS?", fileId: setting?.introVideoFileId ?? null, organizationId: career.id };
  }
  async function updateIntroVideo(userId: string, raw: unknown) {
    const data = videoInput.parse(raw);
    const career = await client.organization.findUnique({ where: { slug: "aira-career-hub" }, select: { id: true, parentId: true, parent: { select: { slug: true } } } });
    if (!career?.parentId || career.parent?.slug !== "aira-skill-city") throw new AccessError("Career Hub scope required");
    const nav = await niceJobsControlPanel.navigation(userId, { divisionId: career.id });
    if (!nav.groups.some(group => group.key === "reports" && group.entries.some(entry => entry.view === "boss-system"))) throw new AccessError("Boss permission required");
    if (nav.companyId !== career.parentId) throw new AccessError("Nice Jobs company scope required");
    const file = await contentFiles.authorize(userId, career.id, data.fileId);
    if (!/^video\/(mp4|webm)$/i.test(file.mimeType)) throw new AccessError("Choose an uploaded MP4 or WebM video");
    return client.$transaction(async db => {
      const setting = await db.niceJobsPortalSetting.upsert({ where: { id: "nice-jobs" }, create: { id: "nice-jobs", companyId: nav.companyId, introVideoTitle: data.title, introVideoFileId: data.fileId, updatedByUserId: userId }, update: { introVideoTitle: data.title, introVideoFileId: data.fileId, updatedByUserId: userId } });
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, organizationId: nav.companyId, action: "nicejobs.intro_video.published", entityType: "NiceJobsPortalSetting", entityId: setting.id, result: "SUCCESS", metadata: { title: setting.introVideoTitle, fileId: setting.introVideoFileId, mimeType: file.mimeType } }) });
      return { title: setting.introVideoTitle, fileId: setting.introVideoFileId };
    });
  }
  return { introVideo, updateIntroVideo };
}
export const niceJobsPortalSettings = createNiceJobsPortalSettings();
