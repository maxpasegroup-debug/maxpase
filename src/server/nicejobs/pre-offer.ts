import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { NiceJobsError } from "./input";
import { preOfferCommand, preOfferConfiguration } from "./pre-offer-input";
import { gradeQuiz } from "./onboarding-input";
import { createApplicationService } from "./applications";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function preOfferPlan(raw: string | null) {
  const configuration = raw ? JSON.parse(raw) : null;
  if (!configuration?.preOffer) {
    if (configuration?.preOfferRequired) throw new NiceJobsError("Pre-offer orientation and policies are not configured");
    return null;
  }
  const plan = preOfferConfiguration.parse(configuration.preOffer);
  return { plan, fingerprint: hash({ videoTitle: plan.videoTitle, videoUrl: plan.videoUrl, videoVersion: plan.videoVersion, form: plan.comprehension.form, policies: plan.policies }) };
}

export async function preOfferEvidence(db: Prisma.TransactionClient, applicationId: string, raw: string | null) {
  const configured = preOfferPlan(raw);
  if (!configured) return null;
  const candidate = await db.niceJobsApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { candidateId: true, divisionId: true, versionId: true } });
  configured.fingerprint = hash({ versionId: candidate.versionId, disclosure: configured.fingerprint });
  const history = await db.niceJobsApplicationHistory.findMany({ where: { applicationId, action: { in: ["PRE_OFFER_ORIENTATION", "PRE_OFFER_POLICIES"] } }, orderBy: { revision: "desc" }, take: 12 });
  const events = await db.operationalEvent.findMany({ where: { id: { in: history.map(row => row.eventId) }, entityType: "NiceJobsApplication", entityId: applicationId, organizationId: candidate.divisionId, status: "SUCCEEDED", audit: { actorPersonId: candidate.candidateId, result: "SUCCESS" } }, select: { id: true }, take: 12 });
  const rows = history.filter(row => events.some(event => event.id === row.eventId));
  const match = (action: string) => rows.find(row => row.action === action && JSON.parse(row.evidence ?? "{}").fingerprint === configured.fingerprint && JSON.parse(row.evidence ?? "{}").result === "PASS");
  const orientation = match("PRE_OFFER_ORIENTATION"), policies = match("PRE_OFFER_POLICIES");
  return { ...configured, orientation, policies, attempts: rows.filter(row => row.action === "PRE_OFFER_ORIENTATION").length };
}

export async function requirePreOffer(db: Prisma.TransactionClient, applicationId: string, raw: string | null) {
  const evidence = await preOfferEvidence(db, applicationId, raw);
  if (!evidence) return null;
  if (!evidence.orientation || !evidence.policies) throw new NiceJobsError("Complete orientation, pass comprehension and acknowledge the current policies before offer issuance");
  return { fingerprint: evidence.fingerprint, videoVersion: evidence.plan.videoVersion, policies: evidence.plan.policies, orientationEventId: evidence.orientation.eventId, policiesEventId: evidence.policies.eventId, orientationCompletedAt: evidence.orientation.createdAt.toISOString(), policiesAcceptedAt: evidence.policies.createdAt.toISOString() };
}

export function createPreOfferService(client: PrismaClient = prisma) {
  const core = createApplicationService(client).internal;
  async function detail(userId: string, reference: string, own = true) {
    return client.$transaction(async db => {
      const boundary = await core.boundary(db, userId, own), application = await core.load(db, boundary, reference, own);
      const evidence = await preOfferEvidence(db, application.id, application.area.version.configuration);
      return evidence ? { fingerprint: evidence.fingerprint, videoTitle: evidence.plan.videoTitle, videoUrl: evidence.plan.videoUrl, videoVersion: evidence.plan.videoVersion, form: evidence.plan.comprehension.form, policies: evidence.plan.policies, passed: !!evidence.orientation, accepted: !!evidence.policies, completedAt: evidence.orientation?.createdAt ?? null, acceptedAt: evidence.policies?.createdAt ?? null, attempts: evidence.attempts, maxAttempts: evidence.plan.comprehension.maxAttempts, revision: application.revision, actionable: own && !["DRAFT", "REJECTED", "WITHDRAWN", "CLOSED", "OFFER_DECLINED", "OFFER_ACCEPTED"].includes(application.status) && application.area.version.template.status === "PUBLISHED" } : null;
    });
  }
  async function mutate(userId: string, raw: unknown) {
    const command = preOfferCommand.parse(raw);
    return client.$transaction(async db => {
      const boundary = await core.boundary(db, userId, true), application = await core.load(db, boundary, command.reference, true);
      const evidence = await preOfferEvidence(db, application.id, application.area.version.configuration);
      if (!evidence || evidence.fingerprint !== command.fingerprint) throw new NiceJobsError("Orientation or policies changed. Refresh before retrying.");
      const replay = await db.niceJobsApplicationHistory.findMany({ where: { applicationId: application.id, action: { in: ["PRE_OFFER_ORIENTATION", "PRE_OFFER_POLICIES"] } }, take: 12, orderBy: { revision: "desc" } });
      const previous = replay.find(row => JSON.parse(row.evidence ?? "{}").idempotencyKey === command.idempotencyKey);
      if (previous) { if (JSON.parse(previous.evidence!).commandHash !== hash(command)) throw new NiceJobsError("Orientation replay mismatch"); return { result: JSON.parse(previous.evidence!).result as string }; }
      if (["DRAFT", "REJECTED", "WITHDRAWN", "CLOSED", "OFFER_DECLINED", "OFFER_ACCEPTED"].includes(application.status) || application.area.version.template.status !== "PUBLISHED" || !application.area.version.publishedAt) throw new NiceJobsError("Orientation is not available for this application");
      let result = "PASS", score: number | null = null;
      if (command.action === "COMPLETE_ORIENTATION") {
        if (evidence.orientation || evidence.attempts >= evidence.plan.comprehension.maxAttempts) throw new NiceJobsError("Orientation already passed or attempt limit reached");
        const grade = gradeQuiz(evidence.plan.comprehension, command.answers); result = grade.result; score = grade.score ?? null;
      } else if (!evidence.orientation || evidence.policies || command.answers !== undefined) throw new NiceJobsError("Pass comprehension before acknowledging policies");
      const changed = await db.niceJobsApplication.updateMany({ where: { id: application.id, revision: command.revision, status: application.status }, data: { revision: { increment: 1 } } });
      if (changed.count !== 1) throw new NiceJobsError("Application changed. Refresh before retrying.");
      const updated = await core.load(db, boundary, command.reference, true);
      await core.record(db, boundary, updated, command.action === "COMPLETE_ORIENTATION" ? "PRE_OFFER_ORIENTATION" : "PRE_OFFER_POLICIES", application.status, undefined, { fingerprint: evidence.fingerprint, idempotencyKey: command.idempotencyKey, commandHash: hash(command), result, score, videoCompletion: "CANDIDATE_ATTESTATION_WITH_COMPREHENSION", videoVersion: evidence.plan.videoVersion, policies: command.action === "ACCEPT_POLICIES" ? evidence.plan.policies : undefined });
      return { result };
    });
  }
  return { detail, mutate };
}
export const preOfferService = createPreOfferService();
