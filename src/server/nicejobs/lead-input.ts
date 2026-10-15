import { z } from "zod";
export const leadSources = ["MANUAL", "WEBSITE", "META", "INSTAGRAM", "GOOGLE", "REFERRAL", "IMPORT", "COMPANY", "OTHER"] as const;
const id = z.string().min(1).max(120), text = z.string().trim().min(1).max(4000), reason = text.max(1000);
export const phone = z.string().trim().max(40).transform(v => v.replace(/[ ()-]/g, "")).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Include the international country code"));
const common = { confirmed: z.literal(true), idempotencyKey: z.string().uuid() };
const target = { leadId: id, revision: z.number().int().nonnegative() };
export const schedule = z.object({ scheduledAt: z.string().datetime({ offset: true }).transform(v => new Date(v)), type: z.enum(["CALL", "EMAIL", "MEETING", "OTHER"]), purpose: text.max(1000), notes: text.optional() }).strict();
export const candidate = z.object({ policyId: id, name: text.max(200), phone, email: z.string().trim().toLowerCase().email().max(254).optional(), location: text.max(200).optional(), source: z.enum(leadSources), priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"), externalReference: id.optional(), notes: text.optional(), workerAssignmentId: id.optional(), duplicateDecision: z.object({ token: z.string().max(200), reason }).strict().optional() }).strict();
export const leadCommand = z.discriminatedUnion("operation", [
  candidate.extend({ ...common, operation: z.literal("CREATE") }).strict(),
  z.object({ ...common, operation: z.literal("POLICY"), divisionId: id, name: text.max(200), definitionId: id, versionIds: z.array(id).min(1).max(50), allowedSources: z.array(z.enum(leadSources)).min(1).max(9), followupRequiredStates: z.array(id).max(30).default([]), claimAllowed: z.boolean().default(false), unassignAllowed: z.boolean().default(false) }).strict(),
  z.object({ ...common, ...target, operation: z.literal("ASSIGN"), workerAssignmentId: id, reason, nextFollowup: schedule.optional() }).strict(),
  z.object({ ...common, ...target, operation: z.literal("UNASSIGN"), reason }).strict(),
  z.object({ ...common, ...target, operation: z.literal("CLAIM"), reason }).strict(),
  z.object({ ...common, ...target, operation: z.literal("CONTACT"), type: z.enum(["CALL", "EMAIL", "MEETING", "OTHER"]), outcome: text.max(1000), nextAction: text.max(1000), notes: text.optional(), nextFollowup: schedule.optional() }).strict(),
  z.object({ ...common, ...target, operation: z.literal("NOTE"), notes: text, visibility: z.enum(["WORKER", "MANAGEMENT"]).default("WORKER") }).strict(),
  z.object({ ...common, ...target, operation: z.literal("TRANSITION"), transitionId: id, reason, cancelScheduled: z.boolean().default(false) }).strict(),
  z.object({ ...common, ...target, operation: z.literal("SCHEDULE"), ...schedule.shape }).strict(),
  z.object({ ...common, ...target, operation: z.literal("COMPLETE"), followupId: id, followupRevision: z.number().int().nonnegative(), outcome: text.max(1000), nextAction: text.max(1000), nextFollowup: schedule.optional() }).strict(),
  z.object({ ...common, ...target, operation: z.literal("CANCEL"), followupId: id, followupRevision: z.number().int().nonnegative(), reason }).strict(),
  z.object({ ...common, ...target, operation: z.literal("ASSIST"), reason, description: text }).strict(),
  z.object({ ...common, ...target, operation: z.literal("REMIND"), followupId: id }).strict(),
]);
export const leadQuery = z.object({ companyId: id.optional(), divisionId: id.optional(), workerAssignmentId: id.optional(), policyId: id.optional(), source: z.enum(leadSources).optional(), status: id.optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(), ownership: z.enum(["assigned", "unassigned"]).optional(), search: z.string().trim().max(200).default(""), from: z.string().datetime({ offset: true }).optional(), until: z.string().datetime({ offset: true }).optional(), after: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(25), queue: z.enum(["all", "today", "new", "priority", "recent", "attention", "available"]).default("all") }).strict().refine(q => !q.from || !q.until || Date.parse(q.from) <= Date.parse(q.until), "Invalid date range");
