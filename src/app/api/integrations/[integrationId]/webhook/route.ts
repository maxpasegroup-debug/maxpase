import { communicationsService } from "@/server/communications/service";
import { consumeSecurityBudget, RateLimitError } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const headers = request.headers;
  if (!headers.get("content-type")?.startsWith("application/json") || Number(headers.get("content-length") ?? 0) > 16384) return Response.json({ error: "Webhook rejected" }, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Webhook rejected" }, { status: 400 });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    await consumeSecurityBudget("webhook:public", 600, 60);
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); return Response.json({ error: "Webhook rejected" }, { status: 400 }); }
      chunks.push(next.value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    await communicationsService.ingest(integrationId, headers.get("x-maxpase-provider") ?? "", body, headers.get("x-maxpase-signature") ?? "", headers.get("x-maxpase-timestamp") ?? "");
    return Response.json({ accepted: true }, { status: 202 });
  } catch (error) { return Response.json({ error: "Webhook rejected" }, { status: error instanceof RateLimitError ? 429 : 400 }); }
}
