import { afterEach, describe, expect, it, vi } from "vitest";
import { resendAdapter, verifiedResendBinding } from "@/server/communications/providers";

const message = { channel: "EMAIL", sender: "verified@example.test", recipient: "recipient@example.test", subject: "Review", content: "Please review the request.", idempotencyKey: "message-123", template: false };
afterEach(() => { vi.unstubAllGlobals(); delete process.env.MAXPASE_VERIFIED_SENDER_phase6_test; });

describe("Resend communication adapter", () => {
  it("requires an exact scope and sender binding plus a resolved credential", async () => {
    const integration = { id: "phase6_test", organizationId: "company-a", credentialReference: "env:TEST_ONLY", configuration: JSON.stringify({ sender: message.sender }) };
    const present = async () => "test-key";
    expect(await verifiedResendBinding(integration, present)).toBe(false);
    process.env.MAXPASE_VERIFIED_SENDER_phase6_test = "company-b:" + message.sender;
    expect(await verifiedResendBinding(integration, present)).toBe(false);
    process.env.MAXPASE_VERIFIED_SENDER_phase6_test = "company-a:" + message.sender;
    expect(await verifiedResendBinding(integration, async () => null)).toBe(false);
    expect(await verifiedResendBinding(integration, present)).toBe(true);
    expect(await verifiedResendBinding({ ...integration, configuration: "bad json" }, present)).toBe(false);
  });
  it("fails closed without credentials and never invokes a provider", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await resendAdapter.send(message, null)).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(resendAdapter.verifyWebhook("{}", "", "", null, new Date())).toBe(false);
  });
  it("records only provider acceptance with an idempotency key", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "provider-123" }) }); vi.stubGlobal("fetch", fetcher);
    expect(await resendAdapter.send(message, "test-key")).toMatchObject({ status: "ACCEPTED", externalReference: "provider-123", retryable: false });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe(message.idempotencyKey);
    expect(JSON.parse(init.body)).toEqual({ from: message.sender, to: [message.recipient], subject: message.subject, text: message.content });
  });
  it("does not claim delivery for rejection, timeout or malformed acceptance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 403 }).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ ok: true, json: async () => ({}) }));
    expect(await resendAdapter.send(message, "test-key")).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_UNAVAILABLE", retryable: false });
    expect(await resendAdapter.send(message, "test-key")).toMatchObject({ status: "UNKNOWN", failureCode: "DELIVERY_UNCERTAIN", retryable: false });
    expect(await resendAdapter.send(message, "test-key")).toMatchObject({ status: "UNKNOWN", failureCode: "DELIVERY_UNCERTAIN", retryable: false });
  });
});
