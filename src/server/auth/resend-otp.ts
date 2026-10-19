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
export type OtpDelivery = { id: string; email: string; code: string; purpose: "LOGIN" | "RESET" };
export function createResendOtpSender(env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch) {
  return async (message: OtpDelivery) => {
    const config = emailAuthSettings(env);
    try {
      const response = await transport("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `nicejobs-otp/${message.id}` },
        body: JSON.stringify({ from: config.NICEJOBS_AUTH_FROM, to: [message.email], subject: message.purpose === "RESET" ? "Reset your Nice Jobs password" : "Your Nice Jobs verification code", text: `Your Nice Jobs code is ${message.code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.` })
      });
      if (!response.ok) throw new EmailAuthUnavailable();
      const receipt = z.object({ id: z.string().min(1).max(200) }).parse(await response.json());
      return receipt.id;
    } catch { throw new EmailAuthUnavailable(); }
  };
}
