import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { BOSS_EMAIL } from "@/server/group/identity";
import { isTimezone } from "@/lib/timezone";
import { buildAuditEventData } from "@/server/audit/audit-service";

const input = z.object({ timezone: z.string().refine(isTimezone, "Choose a valid timezone") }).strict();
export function defaultTimezone(email: string) { return email === BOSS_EMAIL ? "Asia/Kolkata" : "UTC"; }
export function createAccountPreferences(db: PrismaClient = prisma) {
  async function account(userId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, timezone: true, status: true, person: { select: { status: true, displayName: true } } } });
    if (!user || user.status !== "ACTIVE" || user.person && user.person.status !== "ACTIVE") throw new Error("Account unavailable");
    return { email: user.email, name: user.person?.displayName ?? user.email, timezone: user.timezone && isTimezone(user.timezone) ? user.timezone : defaultTimezone(user.email) };
  }
  async function save(userId: string, raw: unknown) {
    const { timezone } = input.parse(raw);
    return db.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { person: true } });
      if (!user || user.status !== "ACTIVE" || user.person && user.person.status !== "ACTIVE") throw new Error("Account unavailable");
      await tx.user.update({ where: { id: userId }, data: { timezone } });
      await tx.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: user.personId, action: "account.timezone_updated", entityType: "User", entityId: userId, result: "SUCCESS", metadata: { timezone } }) });
      return timezone;
    });
  }
  return { account, save };
}
export const accountPreferences = createAccountPreferences();
