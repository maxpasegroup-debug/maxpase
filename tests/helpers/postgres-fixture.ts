import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import { verifyDatabaseReadiness } from "../../src/server/security/readiness";

function isolatedBaseUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  let url: URL;
  try { url = new URL(raw ?? ""); }
  catch { throw new Error("A dedicated PostgreSQL test database is required"); }
  if (process.env.NODE_ENV === "production" || process.env.MAXPASE_CI_DATABASE_CONFIRMED !== "true" ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/maxpase_ci" || url.searchParams.get("schema") !== "public" ||
    !url.username || !url.password) {
    throw new Error("Refusing an unconfirmed or non-local PostgreSQL test target");
  }
  return url;
}

export function createPostgresFixture(options: Omit<Prisma.PrismaClientOptions, "datasourceUrl"> = {}) {
  const base = isolatedBaseUrl();
  const databaseName = `maxpase_t_${randomUUID().replaceAll("-", "")}`;
  const target = new URL(base);
  target.pathname = `/${databaseName}`;
  const admin = new PrismaClient({ datasourceUrl: base.toString() });
  const db = new PrismaClient({ ...options, datasourceUrl: target.toString() });
  let created = false;
  const restoredDatabases: { name: string; db: PrismaClient }[] = [];

  function pgEnvironment(database: string) {
    return {
      ...process.env,
      PGHOST: base.hostname.replace(/^\[|\]$/g, ""),
      PGPORT: base.port || "5432",
      PGUSER: decodeURIComponent(base.username),
      PGPASSWORD: decodeURIComponent(base.password),
      PGDATABASE: database,
      PGSSLMODE: "disable",
    };
  }

  return {
    db,
    client(clientOptions: Omit<Prisma.PrismaClientOptions, "datasourceUrl"> = {}) {
      return new PrismaClient({ ...clientOptions, datasourceUrl: target.toString() });
    },
    async snapshotAndRestore(archivePath: string) {
      if (!created) throw new Error("PostgreSQL fixture must be initialized before backup");
      const restoredName = `maxpase_t_${randomUUID().replaceAll("-", "")}`;
      try {
        execFileSync("pg_dump", ["--format=custom", "--file", archivePath], {
          env: pgEnvironment(databaseName), stdio: "pipe", timeout: 120000
        });
        await admin.$executeRawUnsafe(`CREATE DATABASE "${restoredName}"`);
        const restoredUrl = new URL(base);
        restoredUrl.pathname = `/${restoredName}`;
        const restoredDb = new PrismaClient({ datasourceUrl: restoredUrl.toString() });
        restoredDatabases.push({ name: restoredName, db: restoredDb });
        execFileSync("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", "--dbname", restoredName, archivePath], {
          env: pgEnvironment(restoredName), stdio: "pipe", timeout: 120000
        });
        return restoredDb;
      } catch {
        throw new Error("Isolated PostgreSQL dump/restore failed; pg_dump and pg_restore must be installed");
      }
    },
    runSeed() {
      execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], {
        env: { ...process.env, DATABASE_URL: target.toString(), NODE_ENV: "test" },
        stdio: "pipe", timeout: 120000
      });
    },
    async initialize() {
      const [identity] = await admin.$queryRaw<{ database: string; schema: string; user_name: string }[]>`
        SELECT current_database() AS database, current_schema() AS schema, current_user AS user_name`;
      if (identity.database !== "maxpase_ci" || identity.schema !== "public" || identity.user_name !== decodeURIComponent(base.username)) {
        throw new Error("PostgreSQL test service identity mismatch");
      }
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      created = true;
      try {
        execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
          env: { ...process.env, DATABASE_URL: target.toString() }, stdio: "pipe", timeout: 120000
        });
        await verifyDatabaseReadiness(db);
        await db.$executeRawUnsafe(`
          CREATE FUNCTION maxpase_test_reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'Isolated fixture insert failure' USING ERRCODE = '23514';
          END;
          $$`);
      } catch {
        throw new Error("Isolated PostgreSQL fixture migration or readiness failed");
      }
    },
    async assertIntegrity() {
      const [row] = await db.$queryRaw<{ invalid: bigint; disabled: bigint }[]>`
        SELECT
          (SELECT COUNT(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = 'public' AND c.contype = 'f' AND NOT c.convalidated) AS invalid,
          (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND t.tgisinternal AND t.tgenabled NOT IN ('O', 'A')) AS disabled`;
      if (row.invalid !== 0n || row.disabled !== 0n) throw new Error("PostgreSQL foreign-key integrity enforcement is not active");
    },
    async rejectInsert(table: "AuditEvent" | "Notification", value?: string) {
      const field = table === "AuditEvent" ? "action" : "type";
      const name = `maxpase_test_reject_${randomUUID().replaceAll("-", "")}`;
      const when = value === undefined ? "" : `WHEN (NEW."${field}" = '${value.replaceAll("'", "''")}')`;
      await db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "${table}"
        FOR EACH ROW ${when} EXECUTE FUNCTION maxpase_test_reject_insert()`);
      return async () => db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "${table}"`);
    },
    async dispose() {
      try {
        await db.$disconnect();
        for (const restored of restoredDatabases) {
          await restored.db.$disconnect();
          await admin.$executeRawUnsafe(`DROP DATABASE "${restored.name}" WITH (FORCE)`);
        }
        if (created) {
          await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
          created = false;
        }
      } finally {
        await admin.$disconnect();
      }
    }
  };
}
