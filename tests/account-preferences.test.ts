import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountPreferences } from "@/server/account/preferences";
import { createPostgresFixture } from "./helpers/postgres-fixture";
const fixture = createPostgresFixture();
const db = fixture.db;
const preferences = createAccountPreferences(db);
beforeAll(() => fixture.initialize(), 120000);
afterAll(() => fixture.dispose(), 30000);
describe("Own-account timezone preferences", () => {
  it("defaults Boss to IST, persists preferences per account and audits their actor", async () => {
    const boss = await db.user.create({ data: { email: "boss@maxpase.com" } }), other = await db.user.create({ data: { email: "other@test.invalid" } });
    expect((await preferences.account(boss.id)).timezone).toBe("Asia/Kolkata");
    expect((await preferences.account(other.id)).timezone).toBe("UTC");
    await preferences.save(boss.id, { timezone: "America/New_York" });
    expect((await preferences.account(boss.id)).timezone).toBe("America/New_York");
    expect((await preferences.account(other.id)).timezone).toBe("UTC");
    expect(await db.auditEvent.findFirst({ where: { entityId: boss.id } })).toMatchObject({ actorUserId: boss.id, action: "account.timezone_updated", result: "SUCCESS" });
    await expect(preferences.save(boss.id, { timezone: "UTC", userId: other.id })).rejects.toThrow();
    await expect(preferences.save(boss.id, { timezone: "Forged/Invalid" })).rejects.toThrow();
    await db.user.update({ where: { id: other.id }, data: { status: "INACTIVE" } });
    await expect(preferences.save(other.id, { timezone: "UTC" })).rejects.toThrow("Account unavailable");
    await expect(preferences.account(other.id)).rejects.toThrow("Account unavailable");
  });
  it("rejects inactive linked people and rolls back a preference when audit creation fails", async () => {
    const person = await db.person.create({ data: { displayName: "Inactive", status: "INACTIVE" } });
    const linked = await db.user.create({ data: { email: "linked@test.invalid", personId: person.id } });
    await expect(preferences.save(linked.id, { timezone: "UTC" })).rejects.toThrow("Account unavailable");
    const user = await db.user.create({ data: { email: "rollback@test.invalid", timezone: "UTC" } });
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_preference_audit_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."action" = 'account.timezone_updated' THEN RAISE EXCEPTION 'audit unavailable' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_preference_audit BEFORE INSERT ON "AuditEvent"
      FOR EACH ROW EXECUTE FUNCTION reject_preference_audit_fn()`);
    try { await expect(preferences.save(user.id, { timezone: "Asia/Kolkata" })).rejects.toThrow(); }
    finally {
      await db.$executeRawUnsafe(`DROP TRIGGER reject_preference_audit ON "AuditEvent"`);
      await db.$executeRawUnsafe("DROP FUNCTION reject_preference_audit_fn()");
    }
    expect((await preferences.account(user.id)).timezone).toBe("UTC");
  });
});
