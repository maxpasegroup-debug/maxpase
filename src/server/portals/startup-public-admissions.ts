import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { createSecurityLimiter, RateLimitError, securityKey } from "@/server/security/rate-limit";
import { startupAdmissionIntakes } from "@/server/group/startup-admission-intakes";

const answerSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  mobile: z.union([z.string().trim().regex(/^\+[1-9]\d{7,14}$/), z.literal("")]).optional(),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  state: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  preferredCentre: z.string().trim().max(160).optional(),
  programPreference: z.union([z.enum(["PBA_30_DAYS", "PBA_180_DAYS"]), z.literal("")]).optional(),
  entrepreneurialStage: z.string().trim().max(500).optional(),
  businessInterest: z.string().trim().max(1500).optional(),
  goals: z.string().trim().max(1500).optional(),
  referralInfo: z.string().trim().max(160).optional()
}).strict();
const sendOtpSchema = z.object({ mobile: z.string().trim().regex(/^\+[1-9]\d{7,14}$/) }).strict();
const verifySchema = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
const submitSchema = answerSchema.extend({
  fullName: z.string().trim().min(2).max(120), mobile: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  email: z.union([z.email().max(254), z.literal("")]), state: z.string().trim().min(2).max(100), district: z.string().trim().min(2).max(100),
  programPreference: z.enum(["PBA_30_DAYS", "PBA_180_DAYS"]), entrepreneurialStage: z.string().trim().min(3).max(500),
  businessInterest: z.string().trim().min(8).max(1500), goals: z.string().trim().min(8).max(1500), consent: z.literal(true)
}).strict();
export const startupPublicDraftInput = answerSchema;
export const startupPublicSubmissionInput = submitSchema;

export type StartupPublicAnswers = z.infer<typeof answerSchema>;
export class StartupPublicUnavailable extends Error { constructor(message = "The public application service is unavailable.") { super(message); } }
export class StartupPublicAccessError extends Error { constructor(message = "The application draft is unavailable.") { super(message); } }

const CONSENT_VERSION = "startup-public-sia-v1";
const DRAFT_TTL_MS = 30 * 86400_000;
const POST_EXPIRY_RETENTION_MS = 30 * 86400_000;
const OTP_TTL_MS = 10 * 60_000;
const OTP_COOLDOWN_SECONDS = 60;

function secret(env: Record<string, string | undefined>, name: string) {
  const value = env[name];
  if (!value || value.length < 32 || /changeme|replace-with|dev-only/i.test(value)) throw new StartupPublicUnavailable();
  return value;
}
function digest(value: string, key: string) { return createHmac("sha256", key).update(value).digest("hex"); }
function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function normalizeMobile(raw: string) { return raw.trim(); }
function reference() { return `SIA-${randomBytes(9).toString("hex").toUpperCase()}`; }
function applicantCookieValue(id: string, token: string) { return `${id}.${token}`; }
function parsePossession(value: string | undefined, key: string) {
  if (!value || value.length > 256) throw new StartupPublicAccessError();
  const split = value.indexOf(".");
  if (split < 1) throw new StartupPublicAccessError();
  const id = value.slice(0, split), token = value.slice(split + 1);
  if (!/^[a-z0-9]{20,32}$/i.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new StartupPublicAccessError();
  return { id, possessionSecretHash: digest(`startup-public:${id}:${token}`, key) };
}

type OtpSender = (phone: string, code: string, challengeId: string) => Promise<string>;
function twilioSender(env: Record<string, string | undefined>, transport: typeof fetch): OtpSender | null {
  const parsed = z.object({ STARTUP_SMS_PROVIDER: z.literal("twilio"), STARTUP_TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-f]{32}$/i), STARTUP_TWILIO_AUTH_TOKEN: z.string().min(20), STARTUP_TWILIO_FROM: z.string().regex(/^\+[1-9]\d{7,14}$/) }).safeParse(env);
  if (!parsed.success) return null;
  return async (phone, code) => {
    const settings = parsed.data;
    const body = new URLSearchParams({ To: phone, From: settings.STARTUP_TWILIO_FROM, Body: `AIRA Startup Skool verification code: ${code}. It expires in 10 minutes. Do not share this code.` });
    try {
      const response = await transport(`https://api.twilio.com/2010-04-01/Accounts/${settings.STARTUP_TWILIO_ACCOUNT_SID}/Messages.json`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: `Basic ${Buffer.from(`${settings.STARTUP_TWILIO_ACCOUNT_SID}:${settings.STARTUP_TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!response.ok) throw new StartupPublicUnavailable("SMS delivery failed.");
      return z.object({ sid: z.string().min(1).max(100) }).parse(await response.json()).sid;
    } catch { throw new StartupPublicUnavailable("SMS delivery failed."); }
  };
}

function simulatorSender(env: Record<string, string | undefined>, nodeEnv: string): { sender: OtpSender; code: string } | null {
  if (nodeEnv === "production" || env.STARTUP_OTP_SIMULATOR_ENABLED !== "true") return null;
  const code = env.STARTUP_OTP_SIMULATOR_CODE;
  if (!/^\d{6}$/.test(code ?? "")) return null;
  return { code: code!, sender: async (_phone, _code, id) => `dev-simulator:${id}` };
}

export function createStartupPublicAdmissions(client: PrismaClient = prisma, options: { env?: Record<string, string | undefined>; now?: () => Date; sendOtp?: OtpSender; nodeEnv?: string } = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const consume = createSecurityLimiter(client, now);

  function keys() { return { possession: secret(env, "AUTH_SECRET"), otp: secret(env, "STARTUP_PUBLIC_OTP_SECRET") }; }
  function provider() {
    if (options.sendOtp) return { sender: options.sendOtp, simulatedCode: null as string | null, name: "CUSTOM" };
    const simulator = simulatorSender(env, nodeEnv);
    if (simulator) return { sender: simulator.sender, simulatedCode: simulator.code, name: "DEV_SIMULATOR" };
    const sender = twilioSender(env, fetch);
    if (sender) return { sender, simulatedCode: null, name: "TWILIO" };
    throw new StartupPublicUnavailable("Startup Skool SMS is not configured. No code was sent.");
  }

  async function pruneExpired() {
    const cutoff = new Date(now().getTime() - POST_EXPIRY_RETENTION_MS);
    await client.$transaction(async db => {
      const old = await db.startupPublicApplicant.findMany({ where: { status: { in: ["DRAFT", "EXPIRED"] }, expiresAt: { lt: cutoff } }, select: { id: true }, take: 100, orderBy: { expiresAt: "asc" } });
      if (old.length) {
        const ids = old.map(row => row.id);
        await db.startupApplicationEvent.deleteMany({ where: { applicantId: { in: ids } } });
        await db.startupPublicApplicant.deleteMany({ where: { id: { in: ids }, status: { in: ["DRAFT", "EXPIRED"] } } });
      }
      await db.startupPublicApplicant.updateMany({ where: { status: "DRAFT", expiresAt: { lte: now() } }, data: { status: "EXPIRED", version: { increment: 1 } } });
    });
  }

  async function owned(cookieValue: string | undefined) {
    const keysValue = keys();
    const possession = parsePossession(cookieValue, keysValue.possession);
    const row = await client.startupPublicApplicant.findFirst({ where: { id: possession.id, possessionSecretHash: possession.possessionSecretHash, organization: { slug: "aira-skill-city", type: "COMPANY", status: "ACTIVE", company: { status: "ACTIVE" } } } });
    if (!row) throw new StartupPublicAccessError();
    if (row.status === "DRAFT" && row.expiresAt <= now()) {
      await client.startupPublicApplicant.updateMany({ where: { id: row.id, status: "DRAFT", version: row.version }, data: { status: "EXPIRED", version: { increment: 1 } } });
      throw new StartupPublicAccessError("This draft has expired. Start a new application.");
    }
    if (row.status === "EXPIRED") throw new StartupPublicAccessError("This draft has expired. Start a new application.");
    return { row, keysValue };
  }

  async function createDraft(cookieValue?: string, addressKey = "unknown", forceNew = false) {
    await pruneExpired();
    if (cookieValue && !forceNew) {
      try {
        const { row } = await owned(cookieValue);
        if (row.status !== "EXPIRED") return { cookie: cookieValue, answers: answersFrom(row), verified: !!row.phoneVerifiedAt, status: row.status, reference: row.status !== "DRAFT" ? row.reference : null, submittedAt: row.submittedAt };
      } catch (error) { if (!(error instanceof StartupPublicAccessError)) throw error; }
    }
    await consume("startup:public:draft:create:global", 300, 60);
    await consume(securityKey("startup:public:draft:create:ip", addressKey), 10, 3600);
    const keysValue = keys();
    const organization = await client.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, type: true, status: true, company: { select: { status: true } } } });
    if (!organization || organization.type !== "COMPANY" || organization.status !== "ACTIVE" || organization.company?.status !== "ACTIVE") throw new StartupPublicUnavailable();
    const id = `c${randomBytes(12).toString("hex")}`;
    const token = randomBytes(32).toString("base64url");
    const cookie = applicantCookieValue(id, token);
    const createdAt = now();
    const row = await client.$transaction(async db => {
      const created = await db.startupPublicApplicant.create({ data: { id, organizationId: organization.id, reference: reference(), possessionSecretHash: digest(`startup-public:${id}:${token}`, keysValue.possession), expiresAt: new Date(createdAt.getTime() + DRAFT_TTL_MS) } });
      await db.startupApplicationEvent.create({ data: { applicantId: created.id, action: "PUBLIC_DRAFT_CREATED", metadata: JSON.stringify({ source: "SIA_PUBLIC_V1" }) } });
      return created;
    });
    return { cookie, answers: answersFrom(row), verified: false, status: row.status, reference: null, submittedAt: null };
  }

  async function readDraft(cookieValue: string | undefined) {
    const { row } = await owned(cookieValue);
    return { answers: answersFrom(row), verified: !!row.phoneVerifiedAt, status: row.status, reference: row.status !== "DRAFT" ? row.reference : null, submittedAt: row.submittedAt };
  }

  async function updateDraft(cookieValue: string | undefined, raw: unknown, addressKey: string) {
    const { row, keysValue } = await owned(cookieValue);
    const input = answerSchema.parse(raw);
    await consume("startup:public:draft:global", 120, 60);
    await consume(securityKey("startup:public:draft:owner", row.id), 40, 60);
    await consume(securityKey("startup:public:draft:ip", addressKey), 60, 60);
    if (row.status !== "DRAFT") throw new StartupPublicAccessError("This application has already been submitted.");
    const mobileChanged = input.mobile !== undefined && (input.mobile || null) !== row.mobile;
    if (mobileChanged) {
      await client.$transaction(async db => {
        const changed = await db.startupPublicApplicant.updateMany({ where: { id: row.id, status: "DRAFT", version: row.version }, data: { ...toApplicantData(input), normalizedMobile: input.mobile ? normalizeMobile(input.mobile) : null, phoneVerifiedAt: null, version: { increment: 1 } } });
        if (changed.count !== 1) throw new StartupPublicAccessError("Draft changed. Refresh and retry.");
        await db.startupOtpChallenge.updateMany({ where: { applicantId: row.id, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      });
    } else {
      const changed = await client.startupPublicApplicant.updateMany({ where: { id: row.id, status: "DRAFT", version: row.version, expiresAt: { gt: now() } }, data: { ...toApplicantData(input), version: { increment: 1 } } });
      if (changed.count !== 1) throw new StartupPublicAccessError("Draft changed. Refresh and retry.");
    }
    void keysValue;
    return { saved: true };
  }

  async function deleteDraft(cookieValue: string | undefined) {
    const { row } = await owned(cookieValue);
    if (row.status !== "DRAFT") throw new StartupPublicAccessError("Submitted applications cannot be deleted here.");
    await client.$transaction(async db => {
      await db.startupApplicationEvent.deleteMany({ where: { applicantId: row.id } });
      const removed = await db.startupPublicApplicant.deleteMany({ where: { id: row.id, possessionSecretHash: row.possessionSecretHash, status: "DRAFT", version: row.version } });
      if (removed.count !== 1) throw new StartupPublicAccessError("Draft changed. Refresh and retry.");
    });
    return { deleted: true };
  }

  async function sendOtp(cookieValue: string | undefined, raw: unknown, addressKey: string) {
    const input = sendOtpSchema.parse(raw);
    const { row, keysValue } = await owned(cookieValue);
    if (row.status !== "DRAFT") throw new StartupPublicAccessError("This application is no longer a draft.");
    const delivery = provider();
    const mobile = normalizeMobile(input.mobile);
    await consume("startup:public:otp:global", 40, 60);
    await consume(securityKey("startup:public:otp:mobile-hour", mobile), 3, 3600);
    await consume(securityKey("startup:public:otp:ip", addressKey), 10, 3600);
    const recent = await client.startupOtpChallenge.findFirst({ where: { applicantId: row.id, createdAt: { gt: new Date(now().getTime() - OTP_COOLDOWN_SECONDS * 1000) } }, select: { id: true } });
    if (recent) throw new RateLimitError();
    const id = randomUUID();
    const code = delivery.simulatedCode ?? String(randomInt(100000, 1000000));
    const expiresAt = new Date(now().getTime() + OTP_TTL_MS);
    const phoneChanged = row.mobile !== mobile;
    const challenge = await client.$transaction(async db => {
      await db.startupOtpChallenge.updateMany({ where: { applicantId: row.id, status: { in: ["PENDING", "SENT"] } }, data: { status: "CANCELLED" } });
      const saved = await db.startupOtpChallenge.create({ data: { id, applicantId: row.id, mobile, otpHash: digest(`startup-public-otp:${id}:${code}`, keysValue.otp), provider: delivery.name, status: "PENDING", expiresAt } });
      const changed = await db.startupPublicApplicant.updateMany({ where: { id: row.id, status: "DRAFT", version: row.version }, data: { mobile, normalizedMobile: mobile, ...(phoneChanged ? { phoneVerifiedAt: null } : {}), version: { increment: 1 } } });
      if (changed.count !== 1) throw new StartupPublicAccessError("Draft changed. Refresh and retry.");
      return saved;
    });
    try {
      const providerRef = await delivery.sender(mobile, code, challenge.id);
      const marked = await client.startupOtpChallenge.updateMany({ where: { id: challenge.id, status: "PENDING", expiresAt: { gt: now() } }, data: { status: "SENT", providerRef } });
      if (marked.count !== 1) throw new StartupPublicUnavailable("The verification challenge expired before delivery completed.");
    } catch (error) {
      await client.startupOtpChallenge.updateMany({ where: { id: challenge.id, status: "PENDING" }, data: { status: "FAILED" } });
      throw error instanceof StartupPublicUnavailable ? error : new StartupPublicUnavailable("SMS delivery failed. No verification was recorded.");
    }
    return { challengeId: challenge.id, expiresAt, resendAfter: new Date(now().getTime() + OTP_COOLDOWN_SECONDS * 1000), sent: true };
  }

  async function verifyOtp(cookieValue: string | undefined, raw: unknown, addressKey: string) {
    const input = verifySchema.parse(raw);
    const { row, keysValue } = await owned(cookieValue);
    await consume("startup:public:otp:verify:global", 120, 60);
    await consume(securityKey("startup:public:otp:verify:owner", row.id), 10, 900);
    await consume(securityKey("startup:public:otp:verify:ip", addressKey), 30, 900);
    const outcome = await client.$transaction(async db => {
      const challenge = await db.startupOtpChallenge.findFirst({ where: { id: input.challengeId, applicantId: row.id, mobile: row.mobile ?? "", status: "SENT", consumedAt: null }, select: { id: true, mobile: true, otpHash: true, attempts: true, expiresAt: true } });
      if (!challenge || !row.mobile || challenge.mobile !== row.mobile || challenge.expiresAt <= now() || challenge.attempts >= 5) return { error: "Invalid or expired code. Request a new code." as const };
      const correct = safeEqualHex(challenge.otpHash, digest(`startup-public-otp:${challenge.id}:${input.code}`, keysValue.otp));
      if (!correct) {
        const failed = await db.startupOtpChallenge.updateMany({ where: { id: challenge.id, status: "SENT", consumedAt: null, attempts: { lt: 5 } }, data: { attempts: { increment: 1 }, ...(challenge.attempts >= 4 ? { status: "LOCKED" } : {}) } });
        return { error: failed.count !== 1 || challenge.attempts >= 4 ? "Too many attempts. Request a new code." as const : "Invalid or expired code." as const };
      }
      const consumed = await db.startupOtpChallenge.updateMany({ where: { id: challenge.id, applicantId: row.id, mobile: row.mobile, status: "SENT", consumedAt: null, expiresAt: { gt: now() }, attempts: { lt: 5 } }, data: { status: "VERIFIED", consumedAt: now() } });
      if (consumed.count !== 1) throw new StartupPublicAccessError("This code was already used. Request a new code.");
      const applicantUpdated = await db.startupPublicApplicant.updateMany({ where: { id: row.id, status: "DRAFT", mobile: row.mobile, version: row.version }, data: { phoneVerifiedAt: now(), version: { increment: 1 } } });
      if (applicantUpdated.count !== 1) throw new StartupPublicAccessError("Draft changed. Request a new code.");
      await db.startupApplicationEvent.create({ data: { applicantId: row.id, action: "PUBLIC_MOBILE_VERIFIED", metadata: JSON.stringify({ challengeId: challenge.id }) } });
      return { verified: true as const };
    });
    if ("error" in outcome) throw new StartupPublicAccessError(outcome.error);
    return outcome;
  }

  async function submit(cookieValue: string | undefined, raw: unknown, referralToken?: string) {
    const input = submitSchema.parse(raw);
    const { row, keysValue } = await owned(cookieValue);
    if (["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED", "REJECTED"].includes(row.status) && row.submittedAt) return receipt(row, true);
    if (row.status !== "DRAFT" || row.expiresAt <= now()) throw new StartupPublicAccessError("This application draft has expired.");
    if (!row.phoneVerifiedAt || row.normalizedMobile !== normalizeMobile(input.mobile)) throw new StartupPublicAccessError("Verify the mobile number on this application before submitting.");
    if (row.mobile !== input.mobile) throw new StartupPublicAccessError("The verified mobile number changed. Verify it again.");
    const availability = await startupAdmissionIntakes.publicAvailability(now());
    if (!availability.programs.some(program => program.code === input.programPreference)) throw new StartupPublicAccessError("This PBA intake is not currently open. Please check back when applications reopen.");
    const referral = await resolveReferral(client, referralToken, row.organizationId);
    const snapshot = JSON.stringify({ version: 1, ...(input.referralInfo ? { applicantProvided: input.referralInfo } : {}), ...(referral ? { verifiedReferral: referral } : {}) });
    const updated = await client.$transaction(async db => {
      const changed = await db.startupPublicApplicant.updateMany({ where: { id: row.id, organizationId: row.organizationId, possessionSecretHash: row.possessionSecretHash, status: "DRAFT", version: row.version, phoneVerifiedAt: { not: null }, expiresAt: { gt: now() } }, data: { ...toApplicantData(input), mobile: input.mobile, normalizedMobile: normalizeMobile(input.mobile), consentVersion: CONSENT_VERSION, consentedAt: now(), referralSnapshot: snapshot, status: "SUBMITTED", submittedAt: now(), version: { increment: 1 } } });
      if (changed.count !== 1) {
        const current = await db.startupPublicApplicant.findFirst({ where: { id: row.id, possessionSecretHash: row.possessionSecretHash, status: "SUBMITTED", submittedAt: { not: null } } });
        if (current) return current;
        throw new StartupPublicAccessError("Application changed. Refresh and retry.");
      }
      const current = await db.startupPublicApplicant.findUniqueOrThrow({ where: { id: row.id } });
      await db.startupApplicationEvent.create({ data: { applicantId: row.id, action: "PUBLIC_APPLICATION_SUBMITTED", reason: "Applicant submitted the public SIA application", metadata: JSON.stringify({ consentVersion: CONSENT_VERSION, referralAttached: !!referral }) } });
      return current;
    });
    void keysValue;
    return receipt(updated, false);
  }

  async function status(cookieValue: string | undefined, raw: unknown) {
    const input = z.object({ reference: z.string().regex(/^SIA-[A-F0-9]{18}$/) }).strict().parse(raw);
    const { row } = await owned(cookieValue);
    const submitted = await client.startupPublicApplicant.findFirst({ where: { id: row.id, reference: input.reference, status: { in: ["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED", "REJECTED"] }, submittedAt: { not: null } }, select: { reference: true, fullName: true, programPreference: true, status: true, submittedAt: true } });
    if (!submitted) throw new StartupPublicAccessError("Application status could not be found for this verified draft.");
    return { reference: submitted.reference, applicantName: submitted.fullName, program: submitted.programPreference, status: submitted.status, submittedAt: submitted.submittedAt };
  }

  return { createDraft, readDraft, updateDraft, deleteDraft, sendOtp, verifyOtp, submit, status, pruneExpired };
}

function toApplicantData(input: StartupPublicAnswers) {
  return {
    ...(input.fullName !== undefined ? { fullName: input.fullName || null } : {}),
    ...(input.mobile !== undefined ? { mobile: input.mobile ? normalizeMobile(input.mobile) : null } : {}),
    ...(input.email !== undefined ? { email: input.email || null } : {}),
    ...(input.state !== undefined ? { state: input.state } : {}), ...(input.district !== undefined ? { district: input.district } : {}),
    ...(input.preferredCentre !== undefined ? { preferredCentre: input.preferredCentre || null } : {}),
    ...(input.programPreference !== undefined ? { programPreference: input.programPreference || null } : {}),
    ...(input.entrepreneurialStage !== undefined ? { entrepreneurialStage: input.entrepreneurialStage || null } : {}),
    ...(input.businessInterest !== undefined ? { businessInterest: input.businessInterest || null } : {}),
    ...(input.goals !== undefined ? { goals: input.goals || null } : {}),
    ...(input.referralInfo !== undefined ? { referralSnapshot: JSON.stringify({ version: 1, applicantProvided: input.referralInfo }) } : {})
  };
}
function answersFrom(row: { fullName: string | null; mobile: string | null; email: string | null; state: string | null; district: string | null; preferredCentre: string | null; programPreference: string | null; entrepreneurialStage: string | null; businessInterest: string | null; goals: string | null; referralSnapshot: string | null }): StartupPublicAnswers {
  let referralInfo = "";
  try { referralInfo = JSON.parse(row.referralSnapshot ?? "{}").applicantProvided ?? ""; } catch { /* legacy or corrupt snapshot is omitted from applicant form */ }
  return answerSchema.parse({ fullName: row.fullName ?? "", mobile: row.mobile ?? "", email: row.email ?? "", state: row.state ?? "", district: row.district ?? "", preferredCentre: row.preferredCentre ?? "", programPreference: row.programPreference ?? undefined, entrepreneurialStage: row.entrepreneurialStage ?? "", businessInterest: row.businessInterest ?? "", goals: row.goals ?? "", referralInfo });
}
function receipt(row: { reference: string; fullName: string | null; programPreference: string | null; status: string; submittedAt: Date | null }, duplicate: boolean) {
  if (!row.submittedAt) throw new StartupPublicUnavailable();
  return { reference: row.reference, applicantName: row.fullName, program: row.programPreference, status: row.status, submittedAt: row.submittedAt, duplicate };
}
async function resolveReferral(client: PrismaClient | Prisma.TransactionClient, token: string | undefined, companyId: string) {
  if (!token) return null;
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) return null;
  const link = await client.niceJobsReferralLink.findUnique({ where: { token }, include: { assignment: { select: { status: true, profile: { select: { person: { select: { niceJobsId: true } } } } } }, version: { select: { engagement: true } } } });
  if (!link || link.status !== "ACTIVE" || link.companyId !== companyId || link.assignment.status !== "ACTIVE" || link.version.engagement !== "INDEPENDENT_PARTNER" || !link.assignment.profile.person.niceJobsId) return null;
  return { participantId: link.assignment.profile.person.niceJobsId, companyId: link.companyId, opportunityId: link.versionId, referralId: link.id, capturedAt: new Date().toISOString() };
}

export const startupPublicAdmissions = createStartupPublicAdmissions();
