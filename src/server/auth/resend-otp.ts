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
export type OtpDelivery = { id: string; email: string; code: string; purpose: "LOGIN" | "RESET" | "REGISTER" | "RESET_PIN" | "STAFF_INVITE" };
export function niceJobsOtpEmail(message: OtpDelivery) {
  if (!/^\d{6}$/.test(message.code)) throw new EmailAuthUnavailable();
  const action = message.purpose === "STAFF_INVITE" ? "activate your NICEJOBS Director appointment" : message.purpose === "RESET_PIN" ? "reset your PIN" : message.purpose === "RESET" ? "reset your password" : message.purpose === "REGISTER" ? "verify your email" : "sign in";
  const subject = message.purpose === "STAFF_INVITE" ? "Activate your NICEJOBS Director access" : message.purpose === "RESET_PIN" ? "Reset your Nice Jobs PIN" : message.purpose === "RESET" ? "Reset your Nice Jobs password" : "Your Nice Jobs verification code";
  const text = `NICE JOBS\n\nUse ${message.code} to ${action}. This code expires in 10 minutes. Do not share it.\n\nIf you did not request this, ignore this email.`;
  const activationUrl = message.purpose === "STAFF_INVITE" ? `\n\nOpen https://nicejobs.online/activate?challenge=${encodeURIComponent(message.id)} to continue.` : "";
  const activationLink = message.purpose === "STAFF_INVITE" ? `<p style="margin:24px 0"><a href="https://nicejobs.online/activate?challenge=${encodeURIComponent(message.id)}" style="display:inline-block;background:#570713;color:#f4e5c3;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:700">Continue activation</a></p>` : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nice Jobs verification</title></head>
<body style="margin:0;padding:0;background:#f4e5c3;color:#171014;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your Nice Jobs verification code expires in 10 minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4e5c3;border-collapse:collapse"><tr><td align="center" style="padding:28px 14px 36px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #d4af62;border-radius:18px;overflow:hidden">
      <tr><td style="padding:24px 30px;background:#570713;border-bottom:3px solid #d4af62">
        <p style="margin:0;color:#d4af62;font-size:13px;font-weight:700;letter-spacing:2px;line-height:1.5">NICE JOBS</p>
        <p style="margin:3px 0 0;color:#f4e5c3;font-size:11px;letter-spacing:1px;line-height:1.5">AIRA CAREER HUB</p>
      </td></tr>
      <tr><td style="padding:32px 30px 30px">
        <p style="margin:0 0 10px;color:#8b1025;font-size:12px;font-weight:700;letter-spacing:1.2px;line-height:1.5">SECURE ACCOUNT ACCESS</p>
        <h1 style="margin:0 0 12px;color:#171014;font-size:28px;font-weight:700;line-height:1.2">Your verification code</h1>
        <p style="margin:0 0 26px;color:#47363d;font-size:16px;line-height:1.6">Use this six-digit code to ${action}.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:#f4e5c3;border:1px solid #d4af62;border-radius:12px"><tr><td align="center" style="padding:20px 8px;color:#570713;font-size:36px;font-weight:700;letter-spacing:7px;line-height:1.2;font-variant-numeric:tabular-nums">${message.code}</td></tr></table>
        ${activationLink}
        <p style="margin:22px 0 0;color:#47363d;font-size:14px;line-height:1.6"><strong style="color:#570713">Expires in 10 minutes.</strong> Do not share this code with anyone.</p>
      </td></tr>
      <tr><td style="padding:18px 30px 22px;background:#faf7f2;border-top:1px solid #eadfce">
        <p style="margin:0;color:#5b5155;font-size:13px;line-height:1.6">Did not request this code? You can safely ignore this email. Your account will not change.</p>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;color:#5b4149;font-size:12px;line-height:1.5">Nice Jobs &middot; AIRA Career Hub</p>
  </td></tr></table>
</body></html>`;
  return { subject, text: text + activationUrl, html };
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
