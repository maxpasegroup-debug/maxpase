import { randomUUID } from "node:crypto";

export type FailureStage = "origin" | "authentication" | "session_cookie" | "readiness";
export function failureReason(error: unknown, stage: FailureStage, env: NodeJS.ProcessEnv = process.env) {
  if (stage === "origin") return "origin_or_host_rejected";
  if (env.NODE_ENV === "production") {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || /dev-only|replace-with|changeme/i.test(env.AUTH_SECRET)) return "auth_secret_invalid";
    if (!/^file:(?:\/|[A-Za-z]:[\\/])/.test(env.DATABASE_URL ?? "")) return "persistent_sqlite_url_required";
    if (env.AUTH_COOKIE_SECURE === "false") return "secure_cookie_required";
    try { const url = new URL(env.APP_ORIGIN ?? ""); if (url.protocol !== "https:" || url.origin !== env.APP_ORIGIN) return "https_app_origin_required"; }
    catch { return "https_app_origin_required"; }
    if (env.DEV_BOOTSTRAP_PASSWORD) return "development_bootstrap_forbidden";
  }
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "P2021" || code === "P2022") return "database_schema_missing";
  if (code === "P1000" || code === "P1001" || code === "P1003" || code === "P1012") return "database_configuration_or_connection_failed";
  if (env.BOSS_EMAIL && env.BOSS_EMAIL !== "boss@maxpase.com" || env.BOSS_PIN !== undefined && !/^[0-9]{6}$/.test(env.BOSS_PIN)) return "boss_configuration_invalid";
  return stage === "session_cookie" ? "session_cookie_failed" : "operation_failed";
}

export function safeDiagnostic(code: "authentication_failed" | "readiness_failed" | "operation_failed", correlationId: string = randomUUID(), detail?: { stage: FailureStage; reason: ReturnType<typeof failureReason> }) {
  console.error(JSON.stringify({ level: "error", code, correlationId, timestamp: new Date().toISOString(), ...detail }));
  return correlationId;
}
