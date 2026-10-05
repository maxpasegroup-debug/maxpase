import { z } from "zod";
import { resourceInput } from "@/server/domain/operations-input";
import { requiredUtcDate } from "@/server/domain/execution-input";

const id = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(200);
export const channel = z.enum(["EMAIL", "WHATSAPP"]);
export const integrationInput = z.object({ organizationId: id, name: title, channel, provider: z.enum(["MOCK", "EMAIL_UNCONFIGURED", "TALKINLABS"]), enabled: z.boolean().default(false), credentialReference: z.string().regex(/^env:[A-Z][A-Z0-9_]{2,100}$/).nullable().optional(), configuration: z.object({ sender: z.string().min(1).max(254), webhookLimitPerMinute: z.number().int().min(1).max(100).default(30) }).strict() }).strict();
export const policyConfiguration = z.object({ channels: z.array(channel).min(1).max(2), senders: z.array(z.string().min(1).max(254)).min(1).max(10), categories: z.array(z.enum(["TRANSACTIONAL", "OPERATIONAL"])).min(1).max(2), recipientScope: z.literal("ACTIVE_SCOPED_PEOPLE").default("ACTIVE_SCOPED_PEOPLE"), approvalRequired: z.literal(true).default(true), sensitiveContent: z.literal("DENY").default("DENY"), perMinute: z.number().int().min(1).max(30).default(5), perDay: z.number().int().min(1).max(500).default(100), businessHoursUtc: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) }).strict().refine(v => v.start < v.end).nullable().default(null) }).strict();
export const policyInput = z.object({ organizationId: id, projectId: id.nullable().optional(), name: title, controlPointId: id, configuration: policyConfiguration }).strict();
export const consentInput = z.object({ organizationId: id, personId: id, channel, status: z.enum(["OPTED_IN", "OPTED_OUT"]), source: z.string().trim().min(1).max(500), expectedVersion: z.number().int().min(0).optional() }).strict();
export const templateInput = z.object({ organizationId: id, key: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), version: z.number().int().min(1).max(10000), name: title, purpose: title, channel, subject: z.string().max(200).optional(), body: z.string().min(1).max(4000), variables: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/)).max(30) }).strict();
export const messageInput = resourceInput.extend({ integrationId: id, policyId: id, consentId: id, subject: z.string().trim().max(200).optional(), content: z.string().trim().min(1).max(4000), purpose: title, category: z.enum(["TRANSACTIONAL", "OPERATIONAL"]), sensitivity: z.literal("NORMAL").default("NORMAL"), templateId: id.optional(), variables: z.record(z.string(), z.string().max(1000)).default({}), idempotencyKey: z.string().min(8).max(120) }).strict();
export type MessageInput = z.infer<typeof messageInput>;
export const ruleInput = z.object({ organizationId: id, name: title, enabled: z.boolean().default(false), trigger: z.enum(["TASK_OVERDUE", "APPROVAL_PENDING", "PROJECT_BLOCKED"]), action: z.enum(["NOTIFY_OWNER", "REMIND_APPROVER", "FLAG_ATTENTION"]), condition: z.object({ minimumAgeMinutes: z.number().int().min(0).max(525600).default(0), recipientUserId: id }).strict() }).strict().refine(v => ({ TASK_OVERDUE: "NOTIFY_OWNER", APPROVAL_PENDING: "REMIND_APPROVER", PROJECT_BLOCKED: "FLAG_ATTENTION" })[v.trigger] === v.action, "Choose the registered action for this trigger");
export const jobInput = z.object({ ruleId: id, nextRunAt: requiredUtcDate, timezone: z.literal("UTC").default("UTC"), intervalMinutes: z.number().int().min(1).max(525600), maxRuns: z.number().int().min(1).max(1000), maxAttempts: z.number().int().min(1).max(3).default(3) }).strict();
export const webhookEvent = z.discriminatedUnion("type", [
  z.object({ eventId: id, occurredAt: z.iso.datetime(), type: z.literal("INBOUND_MESSAGE"), messageReference: id, sender: z.string().min(1).max(254), recipient: z.string().min(1).max(254), content: z.string().min(1).max(4000), subject: z.string().max(200).optional() }).strict(),
  z.object({ eventId: id, occurredAt: z.iso.datetime(), type: z.literal("DELIVERY_STATUS"), messageReference: id, status: z.enum(["ACCEPTED", "SENT", "DELIVERED", "READ", "FAILED", "REJECTED"]) }).strict()
]);
export function addressFor(kind: string, raw: string | null | undefined) {
  if (!raw) throw new Error("Recipient address unavailable");
  return kind === "EMAIL" ? z.email().max(254).parse(raw).toLowerCase() : z.string().regex(/^\+[1-9]\d{7,14}$/).parse(raw);
}
export function renderTemplate(subject: string | null, body: string, declared: string[], values: Record<string, string>) {
  if (new Set(declared).size !== declared.length || Object.keys(values).sort().join("|") !== [...declared].sort().join("|")) throw new Error("Template variables mismatch");
  const render = (text: string) => {
    const result = text.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g, (_, key: string) => {
      if (!declared.includes(key)) throw new Error("Undeclared template variable");
      return values[key];
    });
    if (/[{}]/.test(result)) throw new Error("Unsupported template expression");
    return result;
  };
  const output = { subject: subject ? render(subject) : null, content: render(body) };
  if (output.content.length > 4000 || (output.subject?.length ?? 0) > 200) throw new Error("Rendered template too large");
  return output;
}
