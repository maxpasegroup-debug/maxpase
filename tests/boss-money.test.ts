import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPostgresFixture } from "./helpers/postgres-fixture";
import { provisionBoss } from "@/server/group/provision";
import { createBossMoneyService } from "@/server/group/boss-money";

const fixture = createPostgresFixture();
const db = fixture.db;
const clock = () => new Date("2026-11-20T12:00:00.000Z");
const money = createBossMoneyService(db, clock);
let ownerId = "";
let outsiderId = "";

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

function entry(values: Partial<Record<string, string>> & Pick<Record<string, string>, "type" | "amount">) {
  return form({ date: "2026-11-20", ...values, requestKey: values.requestKey ?? randomUUID() });
}

function opening() {
  return form({ investments: "1000", sales: "3000", other: "500", expenses: "700", adjustment: "25", reason: "Opening cash reconciliation" });
}

describe("Boss-only My Money PostgreSQL acceptance", () => {
  beforeAll(async () => {
    await fixture.initialize();
    ownerId = (await provisionBoss(db, { BOSS_PIN: "628491" })).userId;
    outsiderId = (await db.user.create({ data: { email: "money-outsider@example.test" } })).id;
  }, 120_000);

  afterAll(async () => fixture.dispose(), 30_000);

  it("persists the opening snapshot and calculates actual income, expenses, budgets, commitments, transfers and venture cash", async () => {
    await money.saveOpening(ownerId, opening());
    const first = await money.dashboard(ownerId);
    expect(first.opening).toMatchObject({ investments: 100_000, sales: 300_000, other: 50_000, expenses: 70_000, adjustment: 2_500 });
    expect(first).toMatchObject({ received: 450_000, spent: 70_000, remaining: 382_500 });
    expect(await db.bossMoneyRecord.count({ where: { ownerUserId: ownerId, kind: "OPENING" } })).toBe(1);

    await money.saveSimple(ownerId, "VENTURE", form({ name: "AIRA Startup School" }));
    await money.saveSimple(ownerId, "HOME_BUDGET", form({ daily: "1000" }));
    await money.saveSimple(ownerId, "OFFICE_BUDGET", form({ venture: "AIRA Startup School", amount: "500" }));

    await money.saveEntry(ownerId, entry({ type: "INCOME", amount: "100", incomeType: "INVESTMENT", venture: "AIRA Startup School", description: "Founder funding", requestKey: "11111111-1111-4111-8111-111111111111" }));
    const repeatedSale = entry({ type: "INCOME", amount: "200", incomeType: "SALES", venture: "AIRA Startup School", source: "Student", description: "Programme receipt", requestKey: "22222222-2222-4222-8222-222222222222" });
    await money.saveEntry(ownerId, repeatedSale);
    await expect(money.saveEntry(ownerId, repeatedSale)).rejects.toThrow();
    await money.saveEntry(ownerId, entry({ type: "INCOME", amount: "50", incomeType: "OTHER_RECEIPT", venture: "AIRA Startup School", description: "Other receipt" }));
    await money.saveEntry(ownerId, entry({ type: "INCOME", amount: "20", incomeType: "REIMBURSEMENT", venture: "AIRA Startup School", description: "Reimbursement" }));

    await money.saveEntry(ownerId, entry({ type: "EXPENSE", amount: "250", area: "HOME", category: "Groceries", description: "Household" }));
    await money.saveEntry(ownerId, entry({ type: "EXPENSE", amount: "70", area: "OFFICE", category: "Marketing", venture: "AIRA Startup School", description: "Campaign materials" }));
    await money.saveEntry(ownerId, entry({ type: "TRANSFER", amount: "9999", description: "Move between own accounts" }));

    await money.saveSimple(ownerId, "COMMITMENT", form({ name: "Office rent", venture: "AIRA Startup School", amount: "150", frequency: "MONTHLY", startDate: "2026-11-15", dueDate: "2026-11-20", endDate: "2027-12-31" }));
    const commitment = (await money.dashboard(ownerId)).commitments.find(c => c.name === "Office rent");
    expect(commitment).toBeDefined();
    const paid = await Promise.allSettled([
      money.markCommitmentPaid(ownerId, form({ id: commitment!.id })),
      money.markCommitmentPaid(ownerId, form({ id: commitment!.id }))
    ]);
    expect(paid.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.bossMoneyRecord.count({ where: { ownerUserId: ownerId, kind: "COMMITMENT_PAYMENT" } })).toBe(1);
    expect(await db.bossMoneyRecord.count({ where: { ownerUserId: ownerId, kind: "ENTRY", payload: { contains: "Fixed commitment" } } })).toBe(1);

    let result = await money.dashboard(ownerId);
    expect(result).toMatchObject({ received: 487_000, spent: 117_000, remaining: 372_500, homeBudget: 100_000, homeToday: 25_000, homeWeek: 25_000, homeMonth: 25_000, officeMonth: 22_000 });
    expect(result.officeBudgets).toContainEqual(expect.objectContaining({ venture: "AIRA Startup School", amount: 50_000, actual: 22_000 }));
    expect(result.summaries).toContainEqual(expect.objectContaining({ venture: "AIRA Startup School", investments: 10_000, sales: 20_000, receipts: 7_000, office: 22_000, contribution: 15_000 }));

    const sale = result.entries.find(e => e.description === "Programme receipt");
    expect(sale).toBeDefined();
    await money.saveEntry(ownerId, entry({ id: sale!.id, type: "INCOME", amount: "250", incomeType: "SALES", venture: "AIRA Startup School", source: "Student", description: "Corrected programme receipt" }));
    result = await money.dashboard(ownerId);
    expect(result.received).toBe(492_000);
    expect(result.summaries.find(v => v.venture === "AIRA Startup School")?.sales).toBe(25_000);
    expect(result.history.some(h => h.action === "ENTRY_EDITED")).toBe(true);

    const beforeRollback = await db.bossMoneyRecord.findFirstOrThrow({ where: { ownerUserId: ownerId, recordKey: sale!.id, kind: "ENTRY" } });
    const changesBeforeRollback = await db.bossMoneyRecord.count({ where: { ownerUserId: ownerId, kind: "CHANGE" } });
    await db.$executeRawUnsafe(`CREATE TRIGGER test_reject_boss_money_update BEFORE UPDATE ON "BossMoneyRecord" FOR EACH ROW WHEN (NEW."kind" = 'ENTRY') EXECUTE FUNCTION maxpase_test_reject_insert()`);
    try {
      await expect(money.saveEntry(ownerId, entry({ id: sale!.id, type: "INCOME", amount: "999", incomeType: "SALES", venture: "AIRA Startup School", description: "Must roll back" }))).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_reject_boss_money_update ON "BossMoneyRecord"`);
    }
    const afterRollback = await db.bossMoneyRecord.findFirstOrThrow({ where: { ownerUserId: ownerId, recordKey: sale!.id, kind: "ENTRY" } });
    expect(afterRollback.payload).toBe(beforeRollback.payload);
    expect(await db.bossMoneyRecord.count({ where: { ownerUserId: ownerId, kind: "CHANGE" } })).toBe(changesBeforeRollback);

    const savedHome = result.entries.find(e => e.description === "Household");
    expect(savedHome).toBeDefined();
    await money.deleteEntry(ownerId, form({ id: savedHome!.id, reason: "Incorrect home expense" }));
    result = await money.dashboard(ownerId);
    expect(result.homeToday).toBe(0);
    expect(result.remaining).toBe(402_500);
    expect(result.history.some(h => h.action === "ENTRY_DELETED")).toBe(true);
  });

  it("isolates records by owner and rejects non-Boss access", async () => {
    await db.bossMoneyRecord.create({ data: { ownerUserId: outsiderId, recordKey: "outsider-private", kind: "ENTRY", payload: JSON.stringify({ type: "INCOME", amount: 999_900 }), amountPaise: 999_900n } });
    const result = await money.dashboard(ownerId);
    expect(result.entries.some(entry => entry.id === "outsider-private")).toBe(false);
    await expect(money.dashboard(outsiderId)).rejects.toThrow("Boss Panel access denied");
    await expect(money.saveEntry(outsiderId, entry({ type: "INCOME", amount: "1", incomeType: "SALES" }))).rejects.toThrow("Boss Panel access denied");
  });

  it("rejects invalid values without persistence and protects the opening adjustment", async () => {
    const count = await db.bossMoneyRecord.count({ where: { ownerUserId: ownerId, kind: "ENTRY" } });
    await expect(money.saveEntry(ownerId, entry({ type: "EXPENSE", amount: "-10", area: "HOME", category: "Food" }))).rejects.toThrow();
    await expect(money.saveEntry(ownerId, entry({ date: "2026-11-14", type: "EXPENSE", amount: "10", area: "HOME", category: "Food" }))).rejects.toThrow();
    await expect(money.saveOpening(ownerId, form({ investments: "-1", sales: "0", other: "0", expenses: "0", adjustment: "0", reason: "" }))).rejects.toThrow();
    await expect(money.saveOpening(ownerId, form({ investments: "0", sales: "0", other: "0", expenses: "0", adjustment: "1", reason: "" }))).rejects.toThrow("Explain a non-zero opening adjustment");
    expect(await db.bossMoneyRecord.count({ where: { ownerUserId: ownerId, kind: "ENTRY" } })).toBe(count);
  });
});
