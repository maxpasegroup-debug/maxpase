import { prisma } from "@/server/db";
import { validateRuntimeEnvironment } from "@/server/config";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { verifyDatabaseReadiness } from "@/server/security/readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    validateRuntimeEnvironment();
    await verifyDatabaseReadiness(prisma);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    const correlationId = safeDiagnostic("readiness_failed");
    return Response.json({ status: "unavailable", correlationId }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
