import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationManifest } from "@/server/security/readiness";
import { Prisma } from "@prisma/client";

const [name] = migrationManifest[0];
const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
const triggers = [...sql.matchAll(/^CREATE TRIGGER\s+(?:"([^"]+)"|([a-z_]+))\s+/gm)].map(match => match[1] ?? match[2]);

describe("PostgreSQL migration source", () => {
  it("selects the PostgreSQL migration chain and archives all SQLite migrations", () => {
    expect(readdirSync("prisma/migrations").filter(entry => /^\d/.test(entry))).toEqual(migrationManifest.map(([migrationName]) => migrationName));
    expect(readdirSync("prisma/sqlite-migrations-archive").filter(entry => /^\d/.test(entry))).toHaveLength(31);
    expect(readFileSync("prisma/migrations/migration_lock.toml", "utf8")).toContain('provider = "postgresql"');
    for (const [migrationName, expectedChecksum] of migrationManifest) {
      expect(createHash("sha256").update(readFileSync(`prisma/migrations/${migrationName}/migration.sql`, "utf8").replaceAll("\r\n", "\n")).digest("hex")).toBe(expectedChecksum);
    }
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

  it("declares every Prisma model table and attaches all safeguards to declared tables", () => {
    const tables = [...sql.matchAll(/^CREATE TABLE "public"\."([^"]+)"/gm)].map(match => match[1]);
    const models = Prisma.dmmf.datamodel.models.map(model => model.dbName ?? model.name);
    expect(new Set(tables).size).toBe(tables.length);
    expect(tables.sort()).toEqual(models.sort());
    const attachments = [...sql.matchAll(/^CREATE TRIGGER\s+(?:"[^"]+"|[a-z_]+)\s+BEFORE\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+"([^"]+)"/gm)];
    expect(attachments).toHaveLength(13);
    for (const [, table] of attachments) {
      expect(tables).toContain(table);
    }
    expect(triggers).toHaveLength(13);
    for (const table of ["User", "Session", "Person", "Organization", "Membership", "Role", "Permission", "RolePermission", "MembershipRole", "AuditEvent"]) {
      expect(tables).toContain(table);
    }
    expect(sql).toContain('CREATE UNIQUE INDEX "User_email_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "Membership_personId_organizationId_scopeKey_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "Role_organizationId_key_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "Permission_key_key"');
    expect(sql).toContain('FOREIGN KEY ("personId") REFERENCES "public"."Person"("id")');
  });
});
