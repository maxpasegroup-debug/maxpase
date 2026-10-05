import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

process.loadEnvFile(".env");
const env = { ...process.env, NODE_ENV: "production" as const, DATABASE_URL: "file:" + resolve("prisma/dev.db").replaceAll("\\", "/"), AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_COOKIE_SECURE: "true", APP_ORIGIN: "https://local-validation.invalid", DEV_BOOTSTRAP_PASSWORD: undefined, NEXT_TELEMETRY_DISABLED: "1", MAXPASE_SMOKE_URL: "http://127.0.0.1:3001", MAXPASE_SMOKE_FIXTURE: "true" };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3001"], { env, stdio: "ignore", windowsHide: true });
async function main() {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (server.exitCode !== null) throw new Error("Local server exited");
    try { ready = (await fetch(env.MAXPASE_SMOKE_URL + "/api/ready")).status === 200; } catch { /* Bounded startup wait. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Local readiness failed");
  for (const script of ["hardening-smoke", "http-smoke", "communications-smoke"]) execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", `scripts/${script}.ts`], { env, stdio: "inherit", windowsHide: true, timeout: 180000 });
  console.log("PASS optimized local runtime and exact fixture cleanup; no production/TLS/browser/provider validation claimed");
}
main().catch(() => { console.error("Optimized local smoke failed; no production environment was accessed."); process.exitCode = 1; }).finally(async () => {
  server.kill();
  if (server.exitCode === null) await new Promise<void>(resolve => server.once("exit", () => resolve()));
});
