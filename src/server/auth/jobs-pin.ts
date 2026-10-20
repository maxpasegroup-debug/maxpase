import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { jobsPinInput } from "./jobs-phone";

const settings = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };
export async function hashJobsPin(pin: string) {
  jobsPinInput.parse(pin);
  return hash(pin, { ...settings, secret: jobsPinPepper(), salt: randomBytes(16) });
}
export async function verifyJobsPin(pin: string, encoded: string) {
  if (!jobsPinInput.safeParse(pin).success) return false;
  return verify(encoded, pin, { secret: jobsPinPepper() });
}
function jobsPinPepper() {
  const value = process.env.NICEJOBS_PIN_PEPPER;
  if (!value || value.length < 32 || /replace-with|changeme|dev-only/i.test(value)) throw new Error("Nice Jobs PIN authentication is not configured");
  return Buffer.from(value);
}
