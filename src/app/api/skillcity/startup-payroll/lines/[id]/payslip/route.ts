import { NextResponse } from "next/server";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { startupHrDesk } from "@/server/skillcity/startup-hr-desk";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { site } = await requestPortal("skillcity", true);
    const session = await getPortalSession(site);
    if (!session) return NextResponse.json({ error: "Sign in to access this payslip." }, { status: 401 });
    const file = await startupHrDesk.payslip(session.userId, (await context.params).id);
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="' + file.filename + '"', "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Payslip is unavailable to this account." }, { status: 404 });
  }
}
