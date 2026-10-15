import { z } from "zod";
const id = z.string().trim().min(1).max(120);
const text = z.string().trim().min(1).max(4000);
export const knowledgeKinds = ["SOP", "RESOURCE", "COMMUNICATION"] as const;
export const resourceKinds = ["DOCUMENT", "PDF", "IMAGE", "VIDEO", "AUDIO", "LINK", "TEMPLATE", "CHECKLIST", "REFERENCE", "CUSTOMER_MATERIAL"] as const;
export const knowledgePayload = z.object({
  title: z.string().trim().min(1).max(200), summary: z.string().trim().max(1000).default(""), purpose: z.string().trim().max(1000).default(""),
  captions: z.string().trim().max(12000).default(""), transcript: z.string().trim().max(40000).default(""),
  audience: z.enum(["COMPANY", "DIVISION", "JOB", "JOB_VERSION", "ASSIGNMENT", "MANAGER_GROUP"]), organizationId: id,
  visibility: z.enum(["WORKER", "MANAGEMENT"]).default("WORKER"), jobId: id.optional(), jobVersionId: id.optional(), assignmentId: id.optional(), managerId: id.optional(),
  effectiveAt: z.iso.datetime({ offset: true }).optional(), reviewAt: z.iso.datetime({ offset: true }).optional(), expiresAt: z.iso.datetime({ offset: true }).optional(), requiredAck: z.boolean().default(false),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"), resourceType: z.enum(resourceKinds).optional(),
  body: text.optional(), url: z.url().max(2000).refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }, "HTTPS link required").optional(), privateReference: id.optional(),
  communicationType: z.enum(["ANNOUNCEMENT", "OPERATIONAL_UPDATE", "SOP_CHANGE", "POLICY_NOTICE", "TRAINING_NOTICE", "MANAGER_INSTRUCTION", "REMINDER", "GENERAL"]).optional(), relatedVersionId: id.optional(),
  steps: z.array(z.object({ title: z.string().trim().min(1).max(200), instruction: text, resourceVersionId: id.optional(), taskId: id.optional(), checklist: z.string().trim().max(1000).optional(), warning: z.string().trim().max(1000).optional(), escalation: z.string().trim().max(1000).optional() }).strict()).max(30).default([])
}).strict().superRefine((p,c) => {
  for (const [field,required] of [["jobId",p.audience === "JOB"],["jobVersionId",p.audience === "JOB_VERSION"],["assignmentId",p.audience === "ASSIGNMENT"],["managerId",p.audience === "MANAGER_GROUP"]] as const) if (!!p[field] !== required) c.addIssue({ code:"custom",message:"Target fields must match the audience",path:[field] });
  if (p.reviewAt && p.effectiveAt && Date.parse(p.reviewAt) <= Date.parse(p.effectiveAt) || p.expiresAt && p.effectiveAt && Date.parse(p.expiresAt) <= Date.parse(p.effectiveAt)) c.addIssue({code:"custom",message:"Invalid content dates"});
});
const base = z.strictObject({confirmed:z.literal(true),idempotencyKey:z.string().uuid()});
const version = base.extend({versionId:id,revision:z.number().int().min(0)});
export const knowledgeCommand = z.discriminatedUnion("operation",[
  base.extend({operation:z.literal("CREATE"),kind:z.enum(knowledgeKinds),payload:knowledgePayload}),
  version.extend({operation:z.literal("EDIT"),payload:knowledgePayload}),
  version.extend({operation:z.enum(["SUBMIT","REVIEW","PUBLISH","ARCHIVE","NEW_VERSION"]),reason:text.optional()}),
  version.extend({operation:z.literal("SCHEDULE"),scheduledAt:z.iso.datetime({offset:true})}),
  base.extend({operation:z.enum(["READ","ACK","INBOX_ARCHIVE"]),versionId:id,evidenceReference:id.optional()}),
  version.extend({operation:z.literal("LINK"),resourceType:z.enum(["TASK","LEAD","FOLLOWUP"]),resourceId:id}),
  version.extend({operation:z.literal("NOTIFY"),assignmentIds:z.array(id).min(1).max(25)})
]);
export const knowledgeQuery = z.object({kind:z.enum(knowledgeKinds),management:z.boolean().default(false),search:z.string().trim().max(200).default(""),organizationId:id.optional(),status:z.enum(["DRAFT","IN_REVIEW","SCHEDULED","PUBLISHED","ARCHIVED","EXPIRED"]).optional(),resourceType:z.enum(resourceKinds).optional(),unread:z.boolean().default(false),required:z.boolean().default(false),priority:z.enum(["LOW","NORMAL","HIGH","CRITICAL"]).optional(),after:id.optional(),limit:z.number().int().min(1).max(100).default(25)}).strict();
