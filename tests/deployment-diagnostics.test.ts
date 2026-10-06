import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { failureReason, safeDiagnostic } from "@/server/security/diagnostics";

const env: NodeJS.ProcessEnv = { NODE_ENV: "production", AUTH_SECRET: randomBytes(32).toString("hex"), DATABASE_URL: "file:/data/maxpase.db", APP_ORIGIN: "https://maxpase.com", AUTH_COOKIE_SECURE: "true" };
describe("Secret-safe deployment diagnostics", () => {
  it("identifies missing production requirements without relaxing authentication", () => {
    expect(failureReason(null, "authentication", { ...env, AUTH_SECRET: "" })).toBe("auth_secret_invalid");
    expect(failureReason(null, "readiness", { ...env, DATABASE_URL: "postgresql://private-value" })).toBe("persistent_sqlite_url_required");
    expect(failureReason(null, "readiness", { ...env, APP_ORIGIN: "http://maxpase.com" })).toBe("https_app_origin_required");
    expect(failureReason(null, "authentication", { ...env, AUTH_COOKIE_SECURE: "false" })).toBe("secure_cookie_required");
    expect(failureReason(null, "origin", env)).toBe("origin_or_host_rejected");
  });
  it("logs only controlled categories, never exception bodies, credentials or environment values", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = { code: "P2021", message: "private-sql-password", stack: "private-stack", meta: env };
      const reason = failureReason(error, "authentication", env);
      expect(reason).toBe("database_schema_missing");
      safeDiagnostic("authentication_failed", "fixture-reference", { stage: "authentication", reason });
      const record = JSON.parse(log.mock.calls[0][0]);
      expect(record).toMatchObject({ reason, stage: "authentication", correlationId: "fixture-reference" });
      expect(JSON.stringify(record)).not.toContain("private"); expect(JSON.stringify(record)).not.toContain(env.AUTH_SECRET);
      expect(failureReason({ code: "private-arbitrary-code" }, "authentication", env)).toBe("operation_failed");
    } finally { log.mockRestore(); }
  });
});
