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
export async function verifiedResendBinding(integration: Pick<Integration, "id" | "organizationId" | "credentialReference" | "configuration">, credentials: CredentialResolver) {
  let sender: unknown;
  try { sender = JSON.parse(integration.configuration).sender; } catch { return false; }
  return typeof sender === "string" && !!integration.credentialReference &&
    process.env["MAXPASE_VERIFIED_SENDER_" + integration.id] === integration.organizationId + ":" + sender &&
    !!await credentials(integration);
}
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
// Activation requires an organization-bound credential and an independently verified sender.
// API acceptance is deliberately distinct from delivery; no webhook is enabled here.
export const resendAdapter: CommunicationAdapter = Object.freeze<CommunicationAdapter>({
  key: "RESEND", live: true, supportsIdempotency: true,
  async send(input, credential) {
    if (input.channel !== "EMAIL" || !credential || !input.subject) return { status: "FAILED", retryable: false, failureCode: "PROVIDER_UNAVAILABLE" };
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({ from: input.sender, to: [input.recipient], subject: input.subject, text: input.content })
      });
    } catch { return { status: "UNKNOWN", retryable: false, failureCode: "DELIVERY_UNCERTAIN" }; }
    if (!response.ok) return { status: "FAILED", retryable: false, failureCode: response.status === 401 || response.status === 403 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED" };
    try {
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !/^[a-zA-Z0-9-]{1,200}$/.test(body.id)) throw new Error("Missing provider reference");
      return { status: "ACCEPTED", externalReference: body.id, retryable: false };
    } catch { return { status: "UNKNOWN", retryable: false, failureCode: "DELIVERY_UNCERTAIN" }; }
  },
  verifyWebhook() { return false; },
  normalizeWebhook() { throw new Error("Resend webhooks are not configured"); }
});
export const providerAdapters = Object.freeze([mockAdapter, resendAdapter, unavailable("EMAIL_UNCONFIGURED"), unavailable("TALKINLABS")]);
export const registeredAdapter = (key: string) => providerAdapters.find(a => a.key === key);
export interface PrivateAttachmentResolver {
  authorize(actorUserId: string, organizationId: string, reference: string): Promise<{ privateHandle: string; mimeType: string; filename: string }>;
}
export const unavailableAttachments: PrivateAttachmentResolver = { async authorize() { throw new Error("Private document delivery is not configured"); } };
