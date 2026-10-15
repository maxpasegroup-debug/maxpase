import { createHash } from "node:crypto";
import { z } from "zod";
import { configuration, NiceJobsError } from "./input";
import { orientationConfiguration, ojtConfiguration, readinessConfiguration, trainingPlan } from "./onboarding-input";
import { curriculumIssues } from "./curriculum";

export function configuredTrainingPlan(raw: string | null) {
  const c=raw?configuration.parse(JSON.parse(raw)):null;
  const parse=<T>(schema:z.ZodType<T>,value:unknown)=>{const result=schema.safeParse(value);return result.success?result.data:null;};
  return trainingPlan.parse({orientation:parse(orientationConfiguration,c?.orientation),ojt:parse(ojtConfiguration,c?.ojt),readiness:parse(readinessConfiguration,c?.readiness)});
}
export function programmeOfferSummary(raw: string | null, versionId: string) {
  const plan=configuredTrainingPlan(raw);
  if(!plan.ojt?.curriculum)return null;
  if(curriculumIssues(plan.ojt).length || !plan.orientation || !plan.readiness?.requireAssessment)throw new NiceJobsError("A complete reviewed training programme is required before offer issuance");
  return {versionId,fingerprint:createHash("sha256").update(JSON.stringify(plan)).digest("hex"),durationDays:100,dayMode:plan.ojt.curriculum.dayMode!,timezone:plan.ojt.curriculum.timezone!};
}
export function requireOfferProgramme(snapshot: unknown, expected: ReturnType<typeof programmeOfferSummary>) {
  const recorded=snapshot && typeof snapshot==="object" && "programme" in snapshot?snapshot.programme:null;
  if(!expected){if(recorded)throw new NiceJobsError("Offer training version mismatch");return;}
  if(!recorded || typeof recorded!=="object" || Object.entries(expected).some(([key,value])=>!(key in recorded) || recorded[key as keyof typeof recorded]!==value))throw new NiceJobsError("Offer training version mismatch. Management must issue an offer for the reviewed programme.");
}
