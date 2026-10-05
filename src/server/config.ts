import { z } from "zod";
import { randomBytes } from "node:crypto";

const developmentSecret = randomBytes(32).toString("base64url");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32).default(developmentSecret),
  AUTH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).default("maxpase_session"),
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export function validateRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  if (production && (!env.DATABASE_URL || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || /dev-only|replace-with|changeme/i.test(env.AUTH_SECRET) || env.AUTH_COOKIE_SECURE === "false")) throw new Error("Production environment is not securely configured");
  if (production) {
    try {
      const origin = new URL(env.APP_ORIGIN ?? "");
      if (origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN || env.DEV_BOOTSTRAP_PASSWORD || !/^file:(?:\/|[A-Za-z]:[\\/])/.test(env.DATABASE_URL!)) throw new Error();
    } catch { throw new Error("Production environment is not securely configured"); }
  }
  return envSchema.parse({ DATABASE_URL: env.DATABASE_URL ?? "file:./dev.db", AUTH_SECRET: env.AUTH_SECRET, AUTH_COOKIE_NAME: env.AUTH_COOKIE_NAME, AUTH_COOKIE_SECURE: env.AUTH_COOKIE_SECURE ?? (production ? "true" : "false") });
}

// Deployments supply secrets at runtime, not while producing build artifacts.
export const config = {
  get AUTH_SECRET() { return validateRuntimeEnvironment().AUTH_SECRET; },
  get AUTH_COOKIE_NAME() { return validateRuntimeEnvironment().AUTH_COOKIE_NAME; },
  get AUTH_COOKIE_SECURE() { return validateRuntimeEnvironment().AUTH_COOKIE_SECURE; }
};
