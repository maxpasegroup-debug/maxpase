import { z } from "zod";
import { quizConfiguration } from "./onboarding-input";

export const preOfferConfiguration = z.object({
  videoTitle: z.string().trim().min(1).max(200),
  videoUrl: z.url().max(2000).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }, "Use an approved HTTPS video URL"),
  videoVersion: z.string().trim().min(1).max(100),
  comprehension: quizConfiguration,
  policies: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/), title: z.string().trim().min(1).max(200), version: z.string().trim().min(1).max(100), text: z.string().trim().min(1).max(12000) }).strict()).min(1).max(10)
}).strict().refine(value => new Set(value.policies.map(policy => policy.key)).size === value.policies.length, "Policy keys must be distinct").refine(value => value.comprehension.assessment.passMark > 0 && value.comprehension.assessment.questions.length > 0, "A scored comprehension check is required");

export const preOfferCommand = z.object({ reference: z.string().uuid(), revision: z.number().int().min(0), idempotencyKey: z.string().uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), action: z.enum(["COMPLETE_ORIENTATION", "ACCEPT_POLICIES"]), acknowledged: z.literal(true), answers: z.unknown().optional() }).strict();
