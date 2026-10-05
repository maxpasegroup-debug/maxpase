import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";

export class RateLimitError extends Error {
  constructor() { super("Too many requests. Try again later."); }
}
export function securityKey(category: string, identifier: string) {
  return category + ":" + createHash("sha256").update(identifier).digest("hex");
}
export function createSecurityLimiter(client: PrismaClient = prisma, now = () => new Date()) {
  return async function consume(key: string, limit: number, windowSeconds: number) {
    if (!key || key.length > 200 || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) throw new Error("Invalid rate policy");
    const time = now(), windowStart = new Date(Math.floor(time.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
    const expiresAt = new Date(windowStart.getTime() + windowSeconds * 1000);
    const accepted = await client.$transaction(async db => {
      await db.securityRateBucket.upsert({ where: { key_windowStart: { key, windowStart } }, create: { key, windowStart, expiresAt }, update: {} });
      return (await db.securityRateBucket.updateMany({ where: { key, windowStart, count: { lt: limit } }, data: { count: { increment: 1 } } })).count === 1;
    });
    if (!accepted) throw new RateLimitError();
  };
}
export const consumeSecurityBudget = createSecurityLimiter();
