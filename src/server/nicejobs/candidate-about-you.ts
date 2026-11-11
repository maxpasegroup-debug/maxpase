import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { requirePortalAccess } from "@/server/portals/policy";
import { NiceJobsError } from "./input";

export const aboutYouOptions = ["STUDENT", "LOOKING_FOR_WORK", "CURRENTLY_EMPLOYED", "HOMEMAKER", "SELF_EMPLOYED", "OTHER"] as const;
export const aboutYouInput = z.enum(aboutYouOptions);
export type AboutYou = z.infer<typeof aboutYouInput>;
export const monthlyEarningTargetInput = z.preprocess(value => {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return value;
}, z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));

function metadataObject(raw: string | null): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function onboardingObject(metadata: Record<string, unknown>) {
  const value = metadata.niceJobsOnboarding;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasCompletedEcosystem(metadata: Record<string, unknown>) {
  const value = onboardingObject(metadata).opportunityEcosystemCompletedAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function readAboutYouMetadata(raw: string | null): AboutYou | null {
  if (!raw) return null;
  try {
    const metadata = JSON.parse(raw);
    return aboutYouInput.safeParse(metadata?.niceJobsAboutYou).data ?? null;
  } catch { return null; }
}

export function createCandidateAboutYou(client: PrismaClient = prisma, now = () => new Date()) {
  async function read(userId: string) {
    return client.$transaction(async db => {
      await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      return readAboutYouMetadata(user.person.metadata);
    });
  }
  async function save(userId: string, raw: unknown) {
    const aboutYou = aboutYouInput.parse(raw);
    return client.$transaction(async db => {
      const scope = await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, personId: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || !user.personId || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      let metadata: Record<string, unknown>;
      try { metadata = JSON.parse(user.person.metadata ?? "{}"); }
      catch { throw new NiceJobsError("Your profile could not be updated. Please try again later."); }
      if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") throw new NiceJobsError("Your profile could not be updated. Please try again later.");
      const updated = await db.person.updateMany({ where: { id: user.personId, metadata: user.person.metadata }, data: { metadata: JSON.stringify({ ...metadata, niceJobsAboutYou: aboutYou }) } });
      if (updated.count !== 1) throw new NiceJobsError("Your profile changed. Reload and try again.");
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.personId, organizationId: scope.divisionId, action: "nicejobs.profile.about_you.updated", entityType: "Person", entityId: user.personId, result: "SUCCESS", metadata: { fields: ["niceJobsAboutYou"] } }) });
      return aboutYou;
    });
  }
  async function readOnboardingProgress(userId: string) {
    return client.$transaction(async db => {
      await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      const aboutYou = readAboutYouMetadata(user.person.metadata);
      let ecosystemCompletedAt: string | null = null;
      let monthlyTargetCompletedAt: string | null = null;
      let initialEarningPlanCompletedAt: string | null = null;
      try {
        const metadata = JSON.parse(user.person.metadata ?? "{}");
        const value = metadata?.niceJobsOnboarding?.opportunityEcosystemCompletedAt;
        if (typeof value === "string" && Number.isFinite(Date.parse(value))) ecosystemCompletedAt = value;
        const targetCompleted = metadata?.niceJobsOnboarding?.monthlyEarningTargetCompletedAt;
        if (typeof targetCompleted === "string" && Number.isFinite(Date.parse(targetCompleted))) monthlyTargetCompletedAt = targetCompleted;
        const planCompleted = metadata?.niceJobsOnboarding?.initialEarningPlanCompletedAt;
        if (typeof planCompleted === "string" && Number.isFinite(Date.parse(planCompleted))) initialEarningPlanCompletedAt = planCompleted;
      } catch { /* Invalid profile metadata is treated as incomplete. */ }
      return { aboutYou, ecosystemCompletedAt, monthlyTargetCompletedAt, initialEarningPlanCompletedAt };
    });
  }
  async function completeOpportunityEcosystem(userId: string) {
    return client.$transaction(async db => {
      const scope = await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, personId: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || !user.personId || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      const aboutYou = readAboutYouMetadata(user.person.metadata);
      if (!aboutYou) throw new AccessError("Complete the profile question first");
      let metadata: Record<string, unknown>;
      try { metadata = JSON.parse(user.person.metadata ?? "{}"); }
      catch { throw new NiceJobsError("Your onboarding progress could not be saved. Please try again."); }
      if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") throw new NiceJobsError("Your onboarding progress could not be saved. Please try again.");
      const progress = metadata.niceJobsOnboarding && typeof metadata.niceJobsOnboarding === "object" && !Array.isArray(metadata.niceJobsOnboarding) ? metadata.niceJobsOnboarding as Record<string, unknown> : {};
      const previous = progress.opportunityEcosystemCompletedAt;
      if (typeof previous === "string" && Number.isFinite(Date.parse(previous))) return previous;
      const completedAt = now().toISOString();
      const updated = await db.person.updateMany({ where: { id: user.personId, metadata: user.person.metadata }, data: { metadata: JSON.stringify({ ...metadata, niceJobsOnboarding: { ...progress, opportunityEcosystemCompletedAt: completedAt } }) } });
      if (updated.count !== 1) throw new NiceJobsError("Your profile changed. Reload and try again.");
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.personId, organizationId: scope.divisionId, action: "nicejobs.onboarding.opportunity_ecosystem.completed", entityType: "Person", entityId: user.personId, result: "SUCCESS", metadata: { fields: ["niceJobsOnboarding.opportunityEcosystemCompletedAt"] } }) });
      return completedAt;
    });
  }
  async function readMonthlyEarningTarget(userId: string) {
    return client.$transaction(async db => {
      await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      const metadata = metadataObject(user.person.metadata);
      return metadata ? monthlyEarningTargetInput.safeParse(metadata.niceJobsMonthlyEarningTarget).data ?? null : null;
    });
  }
  async function saveMonthlyEarningTarget(userId: string, raw: unknown, completeOnboarding = false) {
    const target = monthlyEarningTargetInput.parse(raw);
    return client.$transaction(async db => {
      const scope = await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, personId: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || !user.personId || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      const metadata = metadataObject(user.person.metadata);
      if (!metadata) throw new NiceJobsError("Your profile could not be updated. Please try again later.");
      const onboarding = onboardingObject(metadata);
      if (completeOnboarding && (!readAboutYouMetadata(user.person.metadata) || !hasCompletedEcosystem(metadata))) throw new AccessError("Complete the earlier Nice Jobs onboarding steps first");
      const completedAt = completeOnboarding && !(typeof onboarding.monthlyEarningTargetCompletedAt === "string" && Number.isFinite(Date.parse(onboarding.monthlyEarningTargetCompletedAt)))
        ? now().toISOString()
        : onboarding.monthlyEarningTargetCompletedAt;
      const nextMetadata = {
        ...metadata,
        niceJobsMonthlyEarningTarget: target,
        ...(completeOnboarding ? { niceJobsOnboarding: { ...onboarding, monthlyEarningTargetCompletedAt: completedAt } } : {})
      };
      const updated = await db.person.updateMany({ where: { id: user.personId, metadata: user.person.metadata }, data: { metadata: JSON.stringify(nextMetadata) } });
      if (updated.count !== 1) throw new NiceJobsError("Your profile changed. Reload and try again.");
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.personId, organizationId: scope.divisionId, action: completeOnboarding ? "nicejobs.onboarding.monthly_earning_target.completed" : "nicejobs.profile.monthly_earning_target.updated", entityType: "Person", entityId: user.personId, result: "SUCCESS", metadata: { fields: ["niceJobsMonthlyEarningTarget", ...(completeOnboarding ? ["niceJobsOnboarding.monthlyEarningTargetCompletedAt"] : [])] } }) });
      return target;
    });
  }
  async function completeInitialEarningPlan(userId: string) {
    return client.$transaction(async db => {
      const scope = await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, personId: true, person: { select: { status: true, metadata: true } } } });
      if (user?.status !== "ACTIVE" || !user.personId || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
      const metadata = metadataObject(user.person.metadata);
      if (!metadata) throw new NiceJobsError("Your onboarding progress could not be saved. Please try again.");
      const onboarding = onboardingObject(metadata);
      const target = monthlyEarningTargetInput.safeParse(metadata.niceJobsMonthlyEarningTarget);
      if (!readAboutYouMetadata(user.person.metadata) || !hasCompletedEcosystem(metadata) || !target.success || !onboarding.monthlyEarningTargetCompletedAt || !Number.isFinite(Date.parse(String(onboarding.monthlyEarningTargetCompletedAt)))) throw new AccessError("Complete the earlier Nice Jobs onboarding steps first");
      const previous = onboarding.initialEarningPlanCompletedAt;
      if (typeof previous === "string" && Number.isFinite(Date.parse(previous))) return previous;
      const completedAt = now().toISOString();
      const updated = await db.person.updateMany({ where: { id: user.personId, metadata: user.person.metadata }, data: { metadata: JSON.stringify({ ...metadata, niceJobsOnboarding: { ...onboarding, initialEarningPlanCompletedAt: completedAt } }) } });
      if (updated.count !== 1) throw new NiceJobsError("Your profile changed. Reload and try again.");
      await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.personId, organizationId: scope.divisionId, action: "nicejobs.onboarding.initial_earning_plan.completed", entityType: "Person", entityId: user.personId, result: "SUCCESS", metadata: { fields: ["niceJobsOnboarding.initialEarningPlanCompletedAt"] } }) });
      return completedAt;
    });
  }
  return { read, save, readOnboardingProgress, completeOpportunityEcosystem, readMonthlyEarningTarget, saveMonthlyEarningTarget, completeInitialEarningPlan };
}
export const candidateAboutYou = createCandidateAboutYou();
