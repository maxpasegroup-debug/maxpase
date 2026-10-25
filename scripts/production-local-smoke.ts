import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

async function main() {
  let target: URL;
  try { target = new URL(process.env.TEST_DATABASE_URL ?? ""); }
  catch { throw new Error("Confirmed local PostgreSQL test target required"); }
  if (process.env.MAXPASE_CI_DATABASE_CONFIRMED !== "true" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    target.pathname !== "/maxpase_ci" || target.searchParams.get("schema") !== "public" ||
    !target.username || !target.password) throw new Error("Refusing non-local or unconfirmed test target");
  const db = new PrismaClient({ datasourceUrl: target.toString() });
  try {
    const [identity] = await db.$queryRaw<{ database: string; schema: string; user_name: string }[]>`
      SELECT current_database() AS database, current_schema() AS schema, current_user AS user_name`;
    if (identity.database !== "maxpase_ci" || identity.schema !== "public" || identity.user_name !== decodeURIComponent(target.username)) throw new Error("Test database identity mismatch");
  } finally { await db.$disconnect(); }
  const env = { ...process.env, NODE_ENV: "production" as const, DATABASE_URL: target.toString(), AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_COOKIE_SECURE: "true", APP_ORIGIN: "https://local-validation.invalid", DEV_BOOTSTRAP_PASSWORD: undefined, NEXT_TELEMETRY_DISABLED: "1", MAXPASE_SMOKE_URL: "http://127.0.0.1:3001", MAXPASE_SMOKE_FIXTURE: "true" };
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3001"], { env, stdio: "ignore", windowsHide: true });
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      if (server.exitCode !== null) throw new Error("Local server exited");
      try { ready = (await fetch(env.MAXPASE_SMOKE_URL + "/api/ready")).status === 200; } catch { /* Bounded startup wait. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error("Local readiness failed");
    for (const script of ["hardening-smoke", "http-smoke", "communications-smoke"]) execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", `scripts/${script}.ts`], { env, stdio: "inherit", windowsHide: true, timeout: 180000 });
    console.log("PASS optimized local runtime; no production/TLS/browser/provider validation claimed");
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise<void>(resolve => server.once("exit", () => resolve()));
  }
}
main().catch(() => { console.error("Optimized local smoke failed; no production environment was accessed."); process.exitCode = 1; });
