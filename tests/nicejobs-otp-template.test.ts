import { describe, expect, it, vi } from "vitest";
import { createResendOtpSender, niceJobsOtpEmail, type OtpDelivery } from "@/server/auth/resend-otp";

const message: OtpDelivery = { id: "isolated-otp", email: "candidate@example.test", code: "482917", purpose: "REGISTER" };
const env = { NICEJOBS_EMAIL_AUTH_ENABLED: "true", RESEND_API_KEY: "isolated-test-key", NICEJOBS_AUTH_FROM: "noreply@example.test", NICEJOBS_OTP_SECRET: "isolated-secret-value-at-least-32-characters" };

describe("Nice Jobs OTP email", () => {
  it("provides matching branded HTML and plain text with the real expiry", () => {
    const content = niceJobsOtpEmail(message);
    expect(content.subject).toBe("Your Nice Jobs verification code");
    expect(content.text).toContain(message.code);
    expect(content.html).toContain(message.code);
    expect(content.html).toContain("10 minutes");
    expect(content.html).toContain("#570713");
    expect(content.html).toContain("AIRA CAREER HUB");
    expect(content.html).toContain('role="presentation" width="100%"');
    expect(content.html).toContain("max-width:520px");
    expect(content.html).toContain("background:#ffffff");
    expect(content.html.split(message.code)).toHaveLength(2);
    expect(content.text).toContain("10 minutes");
    expect(content.html).toContain("Do not share");
    expect(niceJobsOtpEmail({ ...message, purpose: "RESET_PIN" }).html).toContain("reset your PIN");
  });

  it("rejects malformed codes and never sends them", async () => {
    const transport = vi.fn();
    await expect(createResendOtpSender(env, transport as unknown as typeof fetch)({ ...message, code: "<script>" })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends HTML and text through the existing bounded Resend transport", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ id: "isolated-receipt" }), { status: 200 }));
    expect(await createResendOtpSender(env, transport as typeof fetch)(message)).toBe("isolated-receipt");
    const [, options] = transport.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({ from: env.NICEJOBS_AUTH_FROM, to: [message.email], subject: "Your Nice Jobs verification code" });
    expect(body.html).toContain(message.code);
    expect(body.text).toContain(message.code);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
