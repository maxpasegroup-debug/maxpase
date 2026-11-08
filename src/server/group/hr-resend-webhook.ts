import { createHmac, timingSafeEqual } from "node:crypto";

export class HrWebhookUnavailable extends Error {}
const maxSkewSeconds = 5 * 60;

export function verifyResendWebhook(payload: string, headers: Headers, secret = process.env.MAXPASE_HR_RESEND_WEBHOOK_SECRET, now = Date.now()) {
  if (!secret?.startsWith("whsec_")) throw new HrWebhookUnavailable("HR Resend webhook secret is not configured");
  const id = headers.get("svix-id"), timestamp = headers.get("svix-timestamp"), signatures = headers.get("svix-signature");
  if (!id || id.length > 200 || !timestamp || !/^\d{1,12}$/.test(timestamp) || !signatures || signatures.length > 2048) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > maxSkewSeconds) return false;
  let key: Buffer;
  try { key = Buffer.from(secret.slice("whsec_".length), "base64"); } catch { return false; }
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return signatures.split(" ").some(entry => {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded || encoded.length > 128) return false;
    let actual: Buffer;
    try { actual = Buffer.from(encoded, "base64"); } catch { return false; }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
