import { z } from "zod";

export const applicationStates = ["DRAFT", "SUBMITTED", "ELIGIBILITY_REVIEW", "SCREENING", "SHORTLISTED", "INTERVIEW", "MANAGEMENT_REVIEW", "APPROVED", "OFFER", "OFFER_ACCEPTED", "OFFER_DECLINED", "REJECTED", "WITHDRAWN", "CLOSED"] as const;
export const fieldTypes = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "MULTI_SELECT", "BOOLEAN", "PHONE", "EMAIL", "DOCUMENT_REFERENCE"] as const;
const scalar = z.union([z.string().max(4000), z.number().finite(), z.boolean()]);
const key = z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).refine(v => !["constructor", "prototype", "__proto__"].includes(v));
export const condition = z.object({ field: key, operator: z.enum(["EQ", "INCLUDES", "GTE", "LTE"]), value: scalar }).strict();
export const applicationConfiguration = z.object({
  fields: z.array(z.object({ key, label: z.string().trim().min(1).max(120), type: z.enum(fieldTypes), required: z.boolean().default(false), when: condition.optional(), options: z.array(z.string().min(1).max(120)).max(40).optional() }).strict()).max(40),
  duplicatePolicy: z.enum(["ACTIVE_PER_VERSION", "ONE_PER_VERSION"]).default("ACTIVE_PER_VERSION"),
  withdrawalStates: z.array(z.enum(["DRAFT", "SUBMITTED", "ELIGIBILITY_REVIEW", "SCREENING"])).max(4).default(["DRAFT", "SUBMITTED", "ELIGIBILITY_REVIEW", "SCREENING"]),
  rejectionCategories: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
}).strict().superRefine((c, ctx) => {
  const keys = new Set(c.fields.map(f => f.key));
  if (keys.size !== c.fields.length) ctx.addIssue({ code: "custom", message: "Field keys must be unique" });
  for (const f of c.fields) {
    if (f.when && (!keys.has(f.when.field) || f.when.field === f.key)) ctx.addIssue({ code: "custom", message: "Invalid conditional field" });
    if (["SELECT", "MULTI_SELECT"].includes(f.type) && (!f.options?.length || new Set(f.options).size !== f.options.length)) ctx.addIssue({ code: "custom", message: "Selection fields need distinct options" });
    const visited = new Set([f.key]);
    let dependency = f.when?.field;
    while (dependency) {
      if (visited.has(dependency)) { ctx.addIssue({ code: "custom", message: "Conditional fields cannot contain cycles" }); break; }
      visited.add(dependency); dependency = c.fields.find(field => field.key === dependency)?.when?.field;
    }
  }
});
export const eligibilityConfiguration = z.object({ rules: z.array(condition.extend({ review: z.boolean().default(false) })).min(1).max(40) }).strict();
export const screeningConfiguration = z.object({ questions: z.array(condition.extend({ weight: z.number().int().min(1).max(100), required: z.boolean().default(false), review: z.boolean().default(false) })).min(1).max(40), passMark: z.number().min(0).max(100) }).strict();
export type FormConfiguration = z.infer<typeof applicationConfiguration>;
export type Answers = Record<string, string | number | boolean | string[]>;
export function matches(c: z.infer<typeof condition>, answers: Answers) {
  const value = answers[c.field];
  switch (c.operator) {
    case "EQ": return value === c.value;
    case "INCLUDES": return Array.isArray(value) && typeof c.value === "string" && value.includes(c.value);
    case "GTE": return typeof value === "number" && typeof c.value === "number" && value >= c.value;
    case "LTE": return typeof value === "number" && typeof c.value === "number" && value <= c.value;
  }
}
export function formConfiguration(config: unknown): FormConfiguration {
  const raw = config && typeof config === "object" && "application" in config ? config.application : null;
  const result = applicationConfiguration.safeParse(raw);
  return result.success ? result.data : applicationConfiguration.parse({ fields: [] });
}
export function validateAnswers(config: FormConfiguration, raw: unknown, submit: boolean): Answers {
  const answers = z.record(z.string(), z.union([scalar, z.array(z.string().max(120)).max(40)])).parse(raw);
  if (new TextEncoder().encode(JSON.stringify(answers)).byteLength > 64000 || Object.keys(answers).some(k => !config.fields.some(f => f.key === k))) throw new Error("Unexpected application fields");
  const normalized: Answers = {};
  for (const f of config.fields) {
    const value = answers[f.key];
    if (value === undefined || value === "" || Array.isArray(value) && !value.length) continue;
    let valid = false;
    switch (f.type) {
      case "NUMBER": valid = typeof value === "number" && Number.isFinite(value); break;
      case "BOOLEAN": valid = typeof value === "boolean"; break;
      case "SELECT": valid = typeof value === "string" && !!f.options?.includes(value); break;
      case "MULTI_SELECT": valid = Array.isArray(value) && new Set(value).size === value.length && value.every(v => f.options?.includes(v)); break;
      case "DATE": valid = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; break;
      case "EMAIL": valid = typeof value === "string" && z.string().email().max(254).safeParse(value).success; break;
      case "PHONE": valid = typeof value === "string" && /^\+?[0-9 ()-]{7,30}$/.test(value); break;
      case "DOCUMENT_REFERENCE": valid = typeof value === "string" && /^[a-zA-Z0-9:_/-]{1,200}$/.test(value); break;
      default: valid = typeof value === "string" && value.length <= (f.type === "TEXTAREA" ? 4000 : 500);
    }
    if (!valid) throw new Error("Check " + f.label);
    normalized[f.key] = typeof value === "string" ? value.trim() : value;
  }
  for (const f of config.fields) {
    const visible = !f.when || matches(f.when, normalized);
    if (!visible && normalized[f.key] !== undefined) throw new Error("Inactive conditional field: " + f.label);
    if (submit && visible && f.required && (normalized[f.key] === undefined || normalized[f.key] === "")) throw new Error("Required: " + f.label);
  }
  return normalized;
}
export function evaluate(config: unknown, answers: Answers, kind: "eligibility" | "screening") {
  const raw = config && typeof config === "object" && kind in config ? (config as Record<string, unknown>)[kind] : null;
  const form = formConfiguration(config);
  if (kind === "eligibility") {
    const parsed = eligibilityConfiguration.safeParse(raw);
    if (!parsed.success) return { status: "NOT_CONFIGURED", evidence: [] };
    const evidence = parsed.data.rules.map(r => ({ ...r, matched: matches(r, answers), needsReview: r.review || answers[r.field] === undefined || form.fields.find(f => f.key === r.field)?.type === "DOCUMENT_REFERENCE" }));
    return { status: evidence.some(e => !e.needsReview && !e.matched) ? "INELIGIBLE" : evidence.some(e => e.needsReview) ? "NEEDS_REVIEW" : "ELIGIBLE", evidence };
  }
  const parsed = screeningConfiguration.safeParse(raw);
  if (!parsed.success) return { status: "NOT_CONFIGURED", evidence: [] };
  const evidence = parsed.data.questions.map(r => ({ ...r, matched: matches(r, answers), needsReview: r.review || answers[r.field] === undefined || form.fields.find(f => f.key === r.field)?.type === "DOCUMENT_REFERENCE" }));
  const score = evidence.reduce((sum, e) => sum + (e.matched ? e.weight : 0), 0) / evidence.reduce((sum, e) => sum + e.weight, 0) * 100;
  return { status: evidence.some(e => e.required && !e.needsReview && !e.matched) ? "FAILED" : evidence.some(e => e.needsReview) ? "NEEDS_REVIEW" : score >= parsed.data.passMark ? "PASSED" : "FAILED", score, passMark: parsed.data.passMark, evidence };
}
