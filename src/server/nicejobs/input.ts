import { z } from "zod";
import { applicationConfiguration, eligibilityConfiguration, screeningConfiguration } from "./application-configuration";
import { interviewConfiguration, managementConfiguration, offerConfiguration } from "./recruitment-input";
import { orientationConfiguration, ojtConfiguration, readinessConfiguration } from "./onboarding-input";

export const jobStates = ["DRAFT", "REVIEW", "PUBLISHED", "PAUSED", "ARCHIVED"] as const;
export const workerStates = ["APPLICANT", "APPROVED", "OFFERED", "OFFER_ACCEPTED", "ORIENTATION", "OJT", "ACTIVE", "SUSPENDED", "EXITED"] as const;
export const configurationSections = ["eligibility", "application", "screening", "interview", "management", "offer", "orientation", "ojt", "readiness", "sop", "dailyWork", "kpi", "reporting", "incentive", "pip", "exitDisciplinary"] as const;
const reference = z.object({ reference: z.string().trim().min(1).max(200), notes: z.string().max(2000).optional() }).strict();
const requirement = z.object({ category: z.enum(["Education", "Experience", "Skills", "Languages", "Availability", "Location", "Documents", "Assessment"]), description: z.string().trim().min(1).max(1000) }).strict();
export const configuration = z.object({ schemaVersion: z.literal(1), requirements: z.array(requirement).max(40).optional(), ...Object.fromEntries(configurationSections.map(key => [key, reference.nullable().optional()])), application: z.union([reference, applicationConfiguration]).nullable().optional(), eligibility: z.union([reference, eligibilityConfiguration]).nullable().optional(), screening: z.union([reference, screeningConfiguration]).nullable().optional(), interview: z.union([reference, interviewConfiguration]).nullable().optional(), management: managementConfiguration.nullable().optional(), offer: z.union([reference, offerConfiguration]).nullable().optional(), orientation: z.union([reference, orientationConfiguration]).nullable().optional(), ojt: z.union([reference, ojtConfiguration]).nullable().optional(), readiness: readinessConfiguration.nullable().optional() }).strict().superRefine((c, ctx) => {
  if (!c.application || !("fields" in c.application)) {
    if (c.eligibility && "rules" in c.eligibility || c.screening && "questions" in c.screening) ctx.addIssue({ code: "custom", message: "Rules require an application form" });
    return;
  }
  const fields = new Set(c.application.fields.map(f => f.key));
  const rules = [...(c.eligibility && "rules" in c.eligibility ? c.eligibility.rules : []), ...(c.screening && "questions" in c.screening ? c.screening.questions : [])];
  if (rules.some(r => !fields.has(r.field))) ctx.addIssue({ code: "custom", message: "Rules must reference configured fields" });
  const predicates = [...rules, ...c.application.fields.flatMap(f => f.when ? [f.when] : [])];
  for (const rule of predicates) {
    const field = c.application.fields.find(f => f.key === rule.field);
    if (!field) continue;
    const valid = rule.operator === "INCLUDES" ? field.type === "MULTI_SELECT" && typeof rule.value === "string" && field.options?.includes(rule.value) : ["GTE", "LTE"].includes(rule.operator) ? field.type === "NUMBER" && typeof rule.value === "number" : field.type === "NUMBER" ? typeof rule.value === "number" : field.type === "BOOLEAN" ? typeof rule.value === "boolean" : field.type === "MULTI_SELECT" ? false : typeof rule.value === "string" && (field.type !== "SELECT" || field.options?.includes(rule.value));
    if (!valid) ctx.addIssue({ code: "custom", message: "Rule comparison must match the field type" });
  }
});
export const versionInput = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).nullable().default(null), engagement: z.enum(["PART_TIME_INCENTIVE", "PART_TIME", "FULL_TIME", "CONTRACT"]).default("PART_TIME_INCENTIVE"), context: z.string().trim().max(500).nullable().default(null), divisionIds: z.array(z.string().min(1).max(200)).min(1).max(12).refine(a => new Set(a).size === a.length), configuration: configuration.nullable().default(null) }).strict();
export const createInput = versionInput.extend({ code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/), visibility: z.enum(["INTERNAL", "PUBLIC"]).default("INTERNAL") });
export const listInput = z.object({ companyId: z.string().max(200).optional(), divisionId: z.string().max(200).optional(), jobId: z.string().max(200).optional(), status: z.enum(jobStates).optional(), assignmentStatus: z.enum(["PREPARED", "ACTIVE", "SUSPENDED", "ENDED"]).optional(), lifecycle: z.enum(workerStates).optional(), search: z.string().trim().max(200).default(""), after: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
export const assignInput = z.object({ personId: z.string().min(1).max(200), versionId: z.string().min(1).max(200), divisionId: z.string().min(1).max(200), managerId: z.string().min(1).max(200).nullable().default(null) }).strict();
export const changeInput = z.object({ id: z.string().min(1).max(200), revision: z.number().int().min(0), to: z.string().max(40), reason: z.string().trim().min(1).max(1000) }).strict();
export class NiceJobsError extends Error {}
export class NiceJobsUnavailable extends Error {}
