"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { communicationsService } from "@/server/communications/service";
import { automationService } from "@/server/communications/automation";
import { siaService } from "@/server/sia/service";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { resultFeedback, batchFeedback, type CommunicationFeedback } from "@/server/communications/feedback";
export type CommunicationActionState = CommunicationFeedback;
export async function communicationAction(_previous: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  const session = await requireSession(), user = session.userId;
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const number = (key: string, fallback?: number) => value(key) ? Number(value(key)) : fallback;
  const organizationId = value("organizationId"), kind = value("command");
  let feedback = resultFeedback("SAVED");
  try {
    if (kind === "integration") { const row = await communicationsService.saveIntegration(user, { organizationId, name: value("name"), channel: value("channel"), provider: value("provider"), enabled: form.has("enabled"), credentialReference: value("credentialReference") || undefined, configuration: { sender: value("sender") } }, value("id") || undefined, number("version")); feedback = resultFeedback(row.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "SAVED"); }
    else if (kind === "consent") await communicationsService.setConsent(user, { organizationId, personId: value("personId"), channel: value("channel"), status: value("status"), source: value("source"), expectedVersion: number("version") });
    else if (kind === "template") await communicationsService.saveTemplate(user, { organizationId, key: value("key"), version: number("version", 1), name: value("name"), purpose: value("purpose"), channel: value("channel"), subject: value("subject") || undefined, body: value("content"), variables: value("variables").split(",").map(s => s.trim()).filter(Boolean) });
    else if (kind === "policy") await communicationsService.savePolicy(user, { organizationId, name: value("name"), controlPointId: value("controlPointId"), configuration: { channels: [value("channel")], senders: [value("sender")], categories: [value("category")], perMinute: number("perMinute", 5), perDay: number("perDay", 100), businessHoursUtc: value("hourStart") || value("hourEnd") ? { start: number("hourStart"), end: number("hourEnd") } : null } });
    else if (kind === "propose") {
      const vars = Object.fromEntries(Array.from(form.entries()).filter(([key]) => key.startsWith("variable:")).map(([key, value]) => [key.slice(9), String(value)]));
      const raw = { organizationId, resourceType: "ORGANIZATION", resourceId: organizationId, integrationId: value("integrationId"), policyId: value("policyId"), consentId: value("consentId"), subject: value("subject") || undefined, content: value("content") || "Template rendering", purpose: value("purpose"), category: value("category"), templateId: value("templateId") || undefined, variables: vars, idempotencyKey: value("idempotencyKey") };
      const row = value("siaId") ? await siaService.proposeCommunication(user, { siaId: value("siaId"), organizationId }, raw) : await communicationsService.propose(user, raw);
      feedback = resultFeedback(row.status);
    } else if (kind === "confirm") feedback = resultFeedback((await communicationsService.confirm(user, value("id"), number("version")!, form.has("confirmed"))).status);
    else if (kind === "cancel") await communicationsService.cancel(user, value("id"), number("version")!);
    else if (kind === "delivery") feedback = resultFeedback((await communicationsService.deliver(user, value("id"))).status);
    else if (kind === "process") {
      const results = await communicationsService.processDue(user, 25);
      revalidatePath("/app/communications");
      return batchFeedback(results);
    } else if (kind === "rule") await automationService.saveRule(user, { organizationId, name: value("name"), enabled: form.has("enabled"), trigger: value("trigger"), action: value("action"), condition: { minimumAgeMinutes: number("minimumAgeMinutes", 0), recipientUserId: value("recipientUserId") } }, value("id") || undefined, number("version"));
    else if (kind === "job") await automationService.schedule(user, { ruleId: value("ruleId"), nextRunAt: value("nextRunAt"), intervalMinutes: number("intervalMinutes"), maxRuns: number("maxRuns") });
    else if (kind === "processJobs") feedback = batchFeedback(await automationService.processDue(user, 25));
    else if (kind === "pauseJob") await automationService.pauseJob(user, value("id"), number("version")!);
    else if (kind === "archive") await communicationsService.archive(user, z.enum(["policy", "template"]).parse(value("kind")), value("id"));
    else if (kind === "thread") await communicationsService.updateThread(user, value("id"), z.enum(["OPEN", "CLOSED"]).parse(value("status")), z.enum(["NORMAL", "HIGH"]).parse(value("priority")));
    else throw new AccessError("Unknown operation");
    revalidatePath("/app/communications"); revalidatePath("/app/operations"); revalidatePath("/app/sia");
    return feedback;
  } catch (e) { if (!(e instanceof AccessError || e instanceof z.ZodError)) safeDiagnostic("operation_failed"); return { ok: false, outcome: e instanceof AccessError ? "BLOCKED" : "FAILED", message: e instanceof AccessError ? e.message : e instanceof z.ZodError ? "Check the supplied values" : "Operation failed. No successful result is claimed." }; }
}
