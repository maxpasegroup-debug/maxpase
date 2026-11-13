import { z } from "zod";

export class JobsSmsUnavailable extends Error {
  constructor() { super("NICEJOBS mobile verification is temporarily unavailable."); }
}

const settings = z.object({
  NICEJOBS_SMS_PROVIDER: z.literal("twilio"),
  NICEJOBS_SMS_ACCOUNT_SID: z.string().regex(/^AC[0-9a-f]{32}$/i),
  NICEJOBS_SMS_AUTH_TOKEN: z.string().min(20),
  NICEJOBS_SMS_FROM: z.string().regex(/^\+[1-9][0-9]{7,14}$/)
});

export function niceJobsSmsReady(env: Record<string, string | undefined> = process.env) {
  return settings.safeParse(env).success;
}

export function createNiceJobsSmsSender(env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch) {
  return async (phone: string, code: string) => {
    const config = settings.safeParse(env);
    if (!config.success || !/^\+[1-9][0-9]{7,14}$/.test(phone) || !/^\d{6}$/.test(code)) throw new JobsSmsUnavailable();
    const { NICEJOBS_SMS_ACCOUNT_SID: sid, NICEJOBS_SMS_AUTH_TOKEN: token, NICEJOBS_SMS_FROM: from } = config.data;
    const body = new URLSearchParams({ To: phone, From: from, Body: `NICEJOBS verification code: ${code}. Expires in 10 minutes. Do not share this code.` });
    try {
      const response = await transport(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body
      });
      if (!response.ok) throw new JobsSmsUnavailable();
      const receipt = z.object({ sid: z.string().min(1), status: z.enum(["accepted", "queued", "sending", "sent"]).optional() }).parse(await response.json());
      return receipt.sid;
    } catch { throw new JobsSmsUnavailable(); }
  };
}
