import { z } from "zod";

export class EmailAuthUnavailable extends Error {
  constructor() { super("Email authentication is temporarily unavailable. Please try again later."); }
}
const settings = z.object({
  NICEJOBS_EMAIL_AUTH_ENABLED: z.literal("true"),
  RESEND_API_KEY: z.string().min(10),
  NICEJOBS_AUTH_FROM: z.email().max(254),
  NICEJOBS_OTP_SECRET: z.string().min(32).refine(value => !/replace-with|changeme|dev-only/i.test(value))
});
export function emailAuthSettings(env: Record<string, string | undefined> = process.env) {
  const result = settings.safeParse(env);
  if (!result.success) throw new EmailAuthUnavailable();
  return result.data;
}
export type OtpDelivery = { id: string; email: string; code: string; purpose: "LOGIN" | "RESET" | "REGISTER" | "RESET_PIN" };
export function niceJobsOtpEmail(message: OtpDelivery) {
  if (!/^\d{6}$/.test(message.code)) throw new EmailAuthUnavailable();
  const action = message.purpose === "RESET_PIN" ? "reset your PIN" : message.purpose === "RESET" ? "reset your password" : message.purpose === "REGISTER" ? "verify your email" : "sign in";
  const subject = message.purpose === "RESET_PIN" ? "Reset your Nice Jobs PIN" : message.purpose === "RESET" ? "Reset your Nice Jobs password" : "Your Nice Jobs verification code";
  const text = `Use ${message.code} to ${action} on Nice Jobs. This code expires in 10 minutes. Do not share it. If you did not request this, ignore this email.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nice Jobs verification</title></head><body style="margin:0;background:#171014;color:#f4e5c3;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">Your Nice Jobs code expires in 10 minutes.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#171014"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#21181c;border:1px solid #70424c;border-radius:18px"><tr><td style="padding:32px"><p style="margin:0 0 22px;color:#d4af62;font-size:14px;font-weight:700;letter-spacing:1px">NICE JOBS</p><h1 style="margin:0 0 12px;color:#ffffff;font-size:26px;line-height:1.25">Your verification code</h1><p style="margin:0 0 24px;color:#f4e5c3;font-size:15px;line-height:1.6">Use this code to ${action}.</p><p style="margin:0 0 24px;padding:18px 12px;background:#570713;border:1px solid #d4af62;border-radius:12px;color:#ffffff;text-align:center;font-size:36px;font-weight:700;letter-spacing:8px;font-variant-numeric:tabular-nums">${message.code}</p><p style="margin:0;color:#f4e5c3;font-size:14px;line-height:1.6">Expires in 10 minutes. Do not share this code with anyone.</p><p style="margin:18px 0 0;color:#cdbfc3;font-size:12px;line-height:1.5">Didn’t request this? You can safely ignore this email.</p></td></tr></table><p style="margin:18px 0 0;color:#cdbfc3;font-size:12px">Nice Jobs · AIRA Career Hub</p></td></tr></table></body></html>`;
  return { subject, text, html };
}
export function createResendOtpSender(env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch) {
  return async (message: OtpDelivery) => {
    const config = emailAuthSettings(env);
    const content = niceJobsOtpEmail(message);
    try {
      const response = await transport("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `nicejobs-otp/${message.id}` },
        body: JSON.stringify({ from: config.NICEJOBS_AUTH_FROM, to: [message.email], ...content })
      });
      if (!response.ok) throw new EmailAuthUnavailable();
      const receipt = z.object({ id: z.string().min(1).max(200) }).parse(await response.json());
      return receipt.id;
    } catch { throw new EmailAuthUnavailable(); }
  };
}
export function createResendPinNoticeSender(env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch) {
  return async (id: string, email: string) => {
    const config = emailAuthSettings(env);
    try {
      const response = await transport("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `nicejobs-pin-changed/${id}` },
        body: JSON.stringify({ from: config.NICEJOBS_AUTH_FROM, to: [email], subject: "Your Nice Jobs PIN changed", text: "Your Nice Jobs PIN was changed. If this was not you, contact Nice Jobs support immediately." })
      });
      if (!response.ok) throw new EmailAuthUnavailable();
    } catch { throw new EmailAuthUnavailable(); }
  };
}
