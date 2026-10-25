import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationManifest } from "@/server/security/readiness";

const [name, checksum] = migrationManifest[0];
const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
const triggers = [...sql.matchAll(/^CREATE TRIGGER\s+(?:"([^"]+)"|([a-z_]+))\s+/gm)].map(match => match[1] ?? match[2]);

describe("PostgreSQL migration source", () => {
  it("selects one PostgreSQL baseline and archives all SQLite migrations", () => {
    expect(readdirSync("prisma/migrations").filter(entry => /^\d/.test(entry))).toEqual([name]);
    expect(readdirSync("prisma/sqlite-migrations-archive").filter(entry => /^\d/.test(entry))).toHaveLength(31);
    expect(readFileSync("prisma/migrations/migration_lock.toml", "utf8")).toContain('provider = "postgresql"');
    expect(createHash("sha256").update(sql).digest("hex")).toBe(checksum);
  });

  it("includes every historic financial and automation trigger name exactly once", () => {
    const names = [
      "nicejobs_wallet_ledger_no_update", "nicejobs_wallet_ledger_no_delete", "nicejobs_wallet_ledger_valid_insert",
      "nicejobs_policy_version_immutable", "nicejobs_earning_calculation_immutable", "nicejobs_adjustment_proposal_immutable",
      "nicejobs_statement_snapshot_immutable", "nicejobs_payout_no_false_confirmation", "nicejobs_payout_valid_intent",
      "nicejobs_wallet_identity_immutable", "nicejobs_ledger_approved_source",
      "NiceJobsAutomationPublishedMaterialImmutable", "NiceJobsAutomationPublishedDeleteForbidden"
    ];
    expect(triggers.sort()).toEqual(names.sort());
    expect(sql).toContain('UPDATE "NiceJobsWallet" SET "revision" = "revision" + 1');
    expect(sql).toContain('r."siaId" IS NULL');
  });
});
