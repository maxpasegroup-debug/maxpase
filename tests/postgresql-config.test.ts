import { describe, expect, it } from "vitest";
import { validateRuntimeEnvironment } from "@/server/config";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:placeholder@db.internal:5432/maxpase",
  AUTH_SECRET: "a-secure-test-secret-of-at-least-32-characters",
  AUTH_COOKIE_SECURE: "true",
  APP_ORIGIN: "https://maxpase.com"
};

describe("PostgreSQL runtime configuration", () => {
  it("accepts a configured PostgreSQL production target", () => {
    expect(validateRuntimeEnvironment(base).DATABASE_URL).toBe(base.DATABASE_URL);
  });

  it.each([undefined, "", "file:/data/maxpase.db", "postgresql://db.internal/maxpase", "postgresql://app:placeholder@db.internal/"])(
    "rejects missing or non-PostgreSQL database configuration %s",
    value => expect(() => validateRuntimeEnvironment({ ...base, DATABASE_URL: value })).toThrow()
  );

  it("does not fall back to a local file in development", () => {
    expect(() => validateRuntimeEnvironment({ NODE_ENV: "development" })).toThrow("PostgreSQL database environment is not configured");
  });
});
