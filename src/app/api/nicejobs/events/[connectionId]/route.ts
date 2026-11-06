import { niceJobsSourceService } from "@/server/nicejobs/source-events";
import { consumeSecurityBudget, RateLimitError } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(connectionId) || !request.headers.get("content-type")?.startsWith("application/json") || Number(request.headers.get("content-length") ?? 0) > 16384) return Response.json({ error: "Event rejected" }, { status: 400 });
  try {
    await consumeSecurityBudget("nicejobs:source:" + connectionId, 120, 60);
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty event");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new Error("Event too large"); }
      chunks.push(part.value);
    }
    await niceJobsSourceService.ingest(connectionId, Buffer.concat(chunks).toString("utf8"), request.headers.get("x-nicejobs-timestamp") ?? "", request.headers.get("x-nicejobs-signature") ?? "");
    return Response.json({ accepted: true }, { status: 202 });
  } catch (error) { return Response.json({ error: "Event rejected" }, { status: error instanceof RateLimitError ? 429 : 400 }); }
}
