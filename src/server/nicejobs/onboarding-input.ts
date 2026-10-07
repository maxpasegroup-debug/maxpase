import { z } from "zod";
import { applicationConfiguration, screeningConfiguration, validateAnswers, evaluate, type Answers } from "./application-configuration";
const key = z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).refine(k => !["constructor", "prototype"].includes(k));
const id = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(200);
export const contentTypes = ["TEXT", "VIDEO", "AUDIO", "DOCUMENT", "IMAGE", "LINK", "QUIZ", "ACKNOWLEDGEMENT"] as const;
export const activityTypes = ["READ", "WATCH", "LISTEN", "PRACTICE", "SUBMIT", "ROLEPLAY", "OBSERVE", "COMPLETE_FORM", "QUIZ"] as const;
export const onboardingStates = ["NOT_STARTED", "ORIENTATION", "OJT", "READINESS_REVIEW", "READY", "NOT_READY", "CANCELLED"] as const;
export const quizConfiguration = z.object({ form: applicationConfiguration, assessment: screeningConfiguration, maxAttempts: z.number().int().min(1).max(10) }).strict().superRefine((q, ctx) => {
  if (!q.form.fields.length || q.assessment.questions.some(r => !q.form.fields.some(f => f.key === r.field) || r.review || q.form.fields.find(f => f.key === r.field)?.type === "DOCUMENT_REFERENCE")) ctx.addIssue({ code: "custom", message: "Quiz needs configured auto-gradable fields and criteria" });
  for (const r of [...q.assessment.questions, ...q.form.fields.flatMap(f => f.when ? [f.when] : [])]) {
    const f = q.form.fields.find(f => f.key === r.field);
    const valid = f && (r.operator === "INCLUDES" ? f.type === "MULTI_SELECT" && typeof r.value === "string" && f.options?.includes(r.value) : ["GTE", "LTE"].includes(r.operator) ? f.type === "NUMBER" && typeof r.value === "number" : f.type === "NUMBER" ? typeof r.value === "number" : f.type === "BOOLEAN" ? typeof r.value === "boolean" : !["MULTI_SELECT", "DOCUMENT_REFERENCE"].includes(f.type) && typeof r.value === "string" && (f.type !== "SELECT" || f.options?.includes(r.value)));
    if (!valid) ctx.addIssue({ code: "custom", message: "Quiz rule does not match its field type or options" });
  }
});
export const evidenceInput = z.object({ text: z.string().trim().max(4000).optional(), attachment: z.object({ type: z.enum(["DOCUMENT", "IMAGE", "VIDEO", "FORM"]), reference: id }).strict().optional(), record: z.object({ type: z.enum(["PROJECT", "TASK", "GOAL", "PROGRAM", "BATCH", "LOCATION", "MILESTONE"]), id }).strict().optional() }).strict().refine(v => !!v.text || !!v.attachment || !!v.record, "Provide evidence");
export const lessonConfiguration = z.object({ key, title, type: z.enum(contentTypes), required: z.boolean().default(true), order: z.number().int().min(0).max(1000), text: z.string().trim().max(4000).nullable().default(null), reference: id.nullable().default(null), completion: z.enum(["ACKNOWLEDGE", "QUIZ", "MENTOR_REVIEW"]), maxAttempts: z.number().int().min(1).max(10).default(1), quiz: quizConfiguration.nullable().default(null) }).strict().superRefine((l, ctx) => {
  if (l.type === "TEXT" || l.type === "ACKNOWLEDGEMENT") { if (!l.text) ctx.addIssue({ code: "custom", message: "Text or acknowledgement content is required" }); }
  else if (l.type !== "QUIZ" && !l.reference) ctx.addIssue({ code: "custom", message: "Content reference is required" });
  if (l.type === "LINK" && (!l.reference || !z.url().safeParse(l.reference).success || !l.reference.startsWith("https://"))) ctx.addIssue({ code: "custom", message: "Approved links must use HTTPS" });
  if (l.completion === "QUIZ" && !l.quiz || l.type === "QUIZ" && l.completion !== "QUIZ" || l.quiz && l.completion !== "QUIZ") ctx.addIssue({ code: "custom", message: "Quiz completion needs explicit quiz configuration" });
});
const moduleConfiguration = z.object({ key, title, required: z.boolean().default(true), order: z.number().int().min(0).max(1000), lessons: z.array(lessonConfiguration).min(1).max(12) }).strict();
export const orientationConfiguration = z.object({ modules: z.array(moduleConfiguration).min(1).max(10) }).strict().superRefine((c, ctx) => {
  const lessons = c.modules.flatMap(m => m.lessons);
  if (new Set(c.modules.map(m => m.key)).size !== c.modules.length || new Set(c.modules.map(m => m.order)).size !== c.modules.length || new Set(lessons.map(l => l.key)).size !== lessons.length || c.modules.some(m => new Set(m.lessons.map(l => l.order)).size !== m.lessons.length) || !c.modules.some(m => m.required && m.lessons.some(l => l.required))) ctx.addIssue({ code: "custom", message: "Distinct ordered modules/lessons and a mandatory requirement are needed" });
});
export const activityConfiguration = z.object({ key, title, type: z.enum(activityTypes), order: z.number().int().min(0).max(1000), required: z.boolean().default(true), instruction: z.string().trim().min(1).max(4000), expectedOutcome: z.string().trim().min(1).max(2000), reference: id.nullable().default(null), evidenceRequired: z.boolean(), reviewRequired: z.boolean(), maxAttempts: z.number().int().min(1).max(10), dueDays: z.number().int().min(1).max(365).nullable().default(null), quiz: quizConfiguration.nullable().default(null) }).strict().refine(a => a.type !== "QUIZ" || !!a.quiz, "Quiz activity needs assessment criteria");
export const ojtConfiguration = z.object({ durationDays: z.number().int().min(1).max(365).nullable().default(null), stages: z.array(z.object({ key, title, order: z.number().int().min(0).max(1000), activities: z.array(activityConfiguration).min(1).max(10) }).strict()).min(1).max(10), assessment: z.union([quizConfiguration.safeExtend({ kind: z.literal("QUIZ") }), z.object({ kind: z.literal("HUMAN"), criteria: z.string().trim().min(1).max(4000), maxAttempts: z.number().int().min(1).max(10) }).strict()]).nullable().default(null) }).strict().superRefine((c, ctx) => {
  const activities = c.stages.flatMap(s => s.activities);
  if (new Set(c.stages.map(s => s.key)).size !== c.stages.length || new Set(c.stages.map(s => s.order)).size !== c.stages.length || new Set(activities.map(a => a.key)).size !== activities.length || c.stages.some(s => new Set(s.activities.map(a => a.order)).size !== s.activities.length) || !activities.some(a => a.required)) ctx.addIssue({ code: "custom", message: "Distinct ordered stages/activities and a mandatory requirement are needed" });
});
export const readinessConfiguration = z.object({ requireAssessment: z.boolean(), criteria: z.string().trim().min(1).max(4000) }).strict();
export const trainingPlan = z.object({ orientation: orientationConfiguration.nullable(), ojt: ojtConfiguration.nullable(), readiness: readinessConfiguration.nullable() }).strict();
export const onboardingInput = z.object({ applicationReference: z.string().uuid(), revision: z.number().int().min(0), operation: z.enum(["ENROLL", "START_ORIENTATION", "COMPLETE_LESSON", "FINISH_ORIENTATION", "ASSIGN_REVIEWER", "START_OJT", "SUBMIT_ACTIVITY", "SUBMIT_ASSESSMENT", "REVIEW", "REQUEST_READINESS", "DECIDE_READINESS", "REOPEN", "CANCEL", "REMIND"]), idempotencyKey: z.string().uuid(), progressId: id.optional(), submissionId: id.optional(), reviewerUserId: id.optional(), reviewerKind: z.enum(["OJT", "READINESS"]).optional(), acknowledged: z.literal(true).optional(), answers: z.record(z.string(), z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.array(z.string().max(120)).max(40)])).optional(), evidence: evidenceInput.optional(), outcome: z.enum(["APPROVED", "REWORK_REQUIRED", "REJECTED", "PASS", "FAIL", "NEEDS_REVIEW", "READY", "NOT_READY"]).optional(), reason: z.string().trim().min(1).max(1000).optional(), feedback: z.string().trim().max(1000).optional() }).strict();
export function gradeQuiz(q: z.infer<typeof quizConfiguration>, raw: unknown) {
  const answers = validateAnswers(q.form, raw, true), result = evaluate({ application: q.form, screening: q.assessment }, answers, "screening");
  return { answers: answers as Answers, result: result.status === "PASSED" ? "PASS" : "FAIL", score: "score" in result ? result.score : null };
}
