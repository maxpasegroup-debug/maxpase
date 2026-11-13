import { describe, expect, it, vi } from "vitest";
import { createNiceJobsSmsSender, niceJobsSmsReady } from "@/server/auth/nicejobs-sms";

const testSid = `AC${"0123456789abcdef".repeat(2)}`;
const env = { NICEJOBS_SMS_PROVIDER: "twilio", NICEJOBS_SMS_ACCOUNT_SID: testSid, NICEJOBS_SMS_AUTH_TOKEN: "isolated-local-test-token-value", NICEJOBS_SMS_FROM: "+14155550123" };

describe("NICEJOBS mobile OTP delivery", () => {
  it("requires explicit SMS provider configuration", async () => {
    expect(niceJobsSmsReady(env)).toBe(true);
    expect(niceJobsSmsReady({})).toBe(false);
    const transport = vi.fn();
    await expect(createNiceJobsSmsSender({}, transport as unknown as typeof fetch)("+919074818881", "123456")).rejects.toThrow("temporarily unavailable");
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends only six-digit codes to validated E.164 numbers", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 201 }));
    expect(await createNiceJobsSmsSender(env, transport as typeof fetch)("+919074818881", "024681")).toBe("SM123");
    const [url, options] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`api.twilio.com/2010-04-01/Accounts/${testSid}/Messages.json`);
    expect(new URLSearchParams(String(options.body)).get("To")).toBe("+919074818881");
    expect(new URLSearchParams(String(options.body)).get("Body")).toContain("024681");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    await expect(createNiceJobsSmsSender(env, transport as typeof fetch)("not-a-phone", "123456")).rejects.toThrow();
    await expect(createNiceJobsSmsSender(env, transport as typeof fetch)("+919074818881", "12345")).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
