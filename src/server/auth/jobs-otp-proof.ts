import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";

export type JobsOtpProof = { challengeId: string; code: string; pepper: string; purpose?: "LOGIN" | "REGISTER" };
export function jobsOtpHash(id: string, code: string, pepper: string) {
  if (pepper.length < 32) throw new Error("Email authentication is not configured");
  return createHmac("sha256", pepper).update(`jobs:${id}:${code}`).digest("hex");
}

export async function claimJobsOtp(db: Prisma.TransactionClient, proof: JobsOtpProof | undefined, user: { id: string; email: string; passwordHash: string | null; jobsPinHash?: string | null }, purpose: "LOGIN" | "RESET" | "REGISTER" | "RESET_PIN", now: Date) {
  if (!proof || !/^[0-9]{6}$/.test(proof.code)) throw new AccessError("Invalid or expired code");
  const challenge = await db.emailAuthChallenge.findUnique({ where: { id: proof.challengeId } });
  const computed = jobsOtpHash(proof.challengeId, proof.code, proof.pepper);
  const credentialHash = purpose === "LOGIN" || purpose === "RESET" ? user.passwordHash : user.jobsPinHash;
  if (!challenge || challenge.userId !== user.id || challenge.email !== user.email || challenge.credentialHash !== credentialHash || challenge.purpose !== purpose || challenge.status !== "SENT" || challenge.expiresAt <= now || challenge.attempts > 5 || !/^[a-f0-9]{64}$/.test(challenge.otpHash) || !timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(challenge.otpHash, "hex"))) throw new AccessError("Invalid or expired code");
  const claimed = await db.emailAuthChallenge.updateMany({ where: { id: challenge.id, status: "SENT", expiresAt: { gt: now }, attempts: { lte: 5 } }, data: { status: "CONSUMED", consumedAt: now } });
  if (claimed.count !== 1) throw new AccessError("Invalid or expired code");
}
