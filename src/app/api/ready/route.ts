import { prisma } from "@/server/db";
import { validateRuntimeEnvironment } from "@/server/config";
import { safeDiagnostic, failureReason } from "@/server/security/diagnostics";
import { verifyDatabaseReadiness } from "@/server/security/readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    validateRuntimeEnvironment();
    await verifyDatabaseReadiness(prisma);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const correlationId = safeDiagnostic("readiness_failed", undefined, { stage: "readiness", reason: failureReason(error, "readiness") });
    return Response.json({ status: "unavailable", correlationId }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
