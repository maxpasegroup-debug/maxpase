import { createHmac, timingSafeEqual } from "node:crypto";
import type { Integration } from "@prisma/client";
import { webhookEvent } from "./input";

export type CredentialResolver = (integration: Pick<Integration, "id" | "organizationId" | "credentialReference">) => Promise<string | null>;
// Deployment owns this binding. An editable reference alone cannot authorize secret access.
export const environmentCredentials: CredentialResolver = async integration => {
  const name = integration.credentialReference?.replace(/^env:/, "");
  if (!name || !/^[A-Z][A-Z0-9_]{2,100}$/.test(name)) return null;
  const allowed = process.env["MAXPASE_CREDENTIAL_BINDING_" + integration.id];
  return allowed === integration.organizationId + ":" + name ? process.env[name] ?? null : null;
};
export type DeliveryResult = { status: "ACCEPTED" | "SENT" | "SIMULATED" | "FAILED" | "REJECTED" | "UNKNOWN"; externalReference?: string; retryable: boolean; failureCode?: "PROVIDER_UNAVAILABLE" | "TRANSIENT_FAILURE" | "DELIVERY_UNCERTAIN" | "PROVIDER_REJECTED" };
export interface CommunicationAdapter {
  readonly key: string;
  readonly live: boolean;
  readonly supportsIdempotency: boolean;
  send(input: { channel: string; sender: string; recipient: string; subject: string | null; content: string; idempotencyKey: string; template: boolean }, credential: string | null): Promise<DeliveryResult>;
  getDeliveryStatus?(externalReference: string, credential: string | null): Promise<DeliveryResult>;
  verifyWebhook(body: string, signature: string, timestamp: string, credential: string | null, now: Date): boolean;
  normalizeWebhook(body: string): ReturnType<typeof webhookEvent.parse>;
}
// This is a MAXPASE development protocol, explicitly NOT a TalkinLabs API contract.
export const mockAdapter: CommunicationAdapter = Object.freeze<CommunicationAdapter>({
  key: "MOCK", live: false, supportsIdempotency: true,
  async send(input) { return { status: "SIMULATED", externalReference: "mock:" + input.idempotencyKey, retryable: false }; },
  async getDeliveryStatus(externalReference) { return { status: "SIMULATED", externalReference, retryable: false }; },
  verifyWebhook(body, signature, timestamp, credential, now) {
    if (!credential || credential.length < 32 || !/^\d{10}$/.test(timestamp) || Math.abs(now.getTime() - Number(timestamp) * 1000) > 300000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
    const expected = createHmac("sha256", credential).update(timestamp + "." + body).digest();
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
  },
  normalizeWebhook(body) { return webhookEvent.parse(JSON.parse(body)); }
});
const unavailable = (key: string): CommunicationAdapter => Object.freeze<CommunicationAdapter>({ key, live: false, supportsIdempotency: false, async send() { return { status: "FAILED", retryable: false, failureCode: "PROVIDER_UNAVAILABLE" }; }, verifyWebhook() { return false; }, normalizeWebhook() { throw new Error("Provider not configured"); } });
export const providerAdapters = Object.freeze([mockAdapter, unavailable("EMAIL_UNCONFIGURED"), unavailable("TALKINLABS")]);
export const registeredAdapter = (key: string) => providerAdapters.find(a => a.key === key);
export interface PrivateAttachmentResolver {
  authorize(actorUserId: string, organizationId: string, reference: string): Promise<{ privateHandle: string; mimeType: string; filename: string }>;
}
export const unavailableAttachments: PrivateAttachmentResolver = { async authorize() { throw new Error("Private document delivery is not configured"); } };
