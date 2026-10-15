import type { PrismaClient } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";
import { createApplicationService } from "@/server/nicejobs/applications";
import { applicationFieldHint } from "@/server/nicejobs/application-guidance";
import { checkContextSize, type Selection } from "./context";
import { resultSchema, type SiaResponse } from "./registry";

export async function applicantContext(client: PrismaClient, userId: string, selection: Selection): Promise<SiaResponse> {
  if (!selection.applicationReference || selection.projectId) throw new AccessError("Application reference required");
  const applications = createApplicationService(client);
  const boundary = await applications.internal.boundary(client, userId, true);
  if (selection.organizationId !== boundary.product.division!.id) throw new AccessError("Applicant scope mismatch");
  const application = await applications.detail(userId, selection.applicationReference, true);
  const source = "NICE_JOBS_APPLICATION:" + application.reference;
  const facts: SiaResponse["facts"] = [{ label: "Opportunity", value: application.title, source }, { label: "Application status", value: application.status, source }, { label: "Next step", value: application.nextStep, source }];
  for (const field of application.form.fields) facts.push({ label: field.label, value: `${field.required ? "Required" : "Optional"}. ${applicationFieldHint(field)}`, source });
  if (application.disclosure) for (const [key, value] of Object.entries(application.disclosure)) if (value) facts.push({ label: key.replace(/([A-Z])/g, " $1"), value, source: "PUBLISHED_JOB_VERSION" });
  const response = resultSchema.parse({ facts, signals: [], recommendations: [], actions: [application.nextStep, "Save your draft, review your answers, then choose Submit application yourself."], approvals: [], limitations: ["Guidance follows the recorded job terms and application questions. It does not write answers, calculate a screening score or make a hiring decision.", "Hiring teams review submitted applications. Creating an account or submitting an application does not guarantee an offer."], provider: "DETERMINISTIC_DOMAIN_EVIDENCE", calculatedAt: new Date().toISOString(), context: { applicationReference: application.reference, canEdit: application.canEdit } });
  checkContextSize(response);
  return response;
}
