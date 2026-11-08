import { consumeSecurityBudget, RateLimitError } from "@/server/security/rate-limit";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";
import { HrWebhookUnavailable, verifyResendWebhook } from "@/server/group/hr-resend-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || Number(request.headers.get("content-length") ?? 0) > 65536) return Response.json({ error: "Webhook rejected" }, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Webhook rejected" }, { status: 400 });
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    await consumeSecurityBudget("webhook:resend:hr", 600, 60);
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 65536) { await reader.cancel(); return Response.json({ error: "Webhook rejected" }, { status: 400 }); }
      chunks.push(next.value);
    }
    const raw = Buffer.concat(chunks).toString("utf8"), eventId = request.headers.get("svix-id");
    if (!verifyResendWebhook(raw, request.headers) || !eventId) return Response.json({ error: "Webhook rejected" }, { status: 401 });
    await hrRecruitmentService.processResendDeliveryEvent(eventId, raw);
    return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : error instanceof HrWebhookUnavailable ? 503 : 400;
    return Response.json({ error: status === 503 ? "Webhook is not configured" : "Webhook rejected" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
