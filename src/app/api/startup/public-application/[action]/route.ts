import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requestPortal } from "@/server/portals/request";
import { RateLimitError } from "@/server/security/rate-limit";
import { StartupPublicAccessError, StartupPublicUnavailable, startupPublicAdmissions } from "@/server/portals/startup-public-admissions";

const draftCookie = "startup_public_applicant";
const apiError = (error: unknown) => {
  if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the information and try again." }, { status: 400 });
  if (error instanceof StartupPublicAccessError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof StartupPublicUnavailable) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
};
function clientKey(request: NextRequest) {
  const trusted = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  return trusted.slice(0, 96);
}
async function body(request: NextRequest): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_384) throw new StartupPublicAccessError("Request is too large.");
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16_384) throw new StartupPublicAccessError("Request is too large.");
    return JSON.parse(raw) as unknown;
  } catch (error) { if (error instanceof StartupPublicAccessError) throw error; throw new StartupPublicAccessError("Invalid request body."); }
}
function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Host, Cookie" } });
}

export async function GET(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { site } = await requestPortal("startup");
    if (site.id !== "startup") return response({ error: "Not found." }, 404);
    const { action } = await context.params;
    if (action !== "draft") return response({ error: "Not found." }, 404);
    const cookieValue = (await cookies()).get(draftCookie)?.value;
    if (!cookieValue) return response({ error: "No saved draft." }, 404);
    return response(await startupPublicAdmissions.readDraft(cookieValue));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { site } = await requestPortal("startup", true);
    if (site.id !== "startup") return response({ error: "Not found." }, 404);
    const { action } = await context.params;
    const jar = await cookies();
    const cookieValue = jar.get(draftCookie)?.value;
    const address = clientKey(request);
    if (action === "draft") {
      const options = z.object({ newDraft: z.boolean().optional() }).strict().parse(await body(request));
      const created = await startupPublicAdmissions.createDraft(cookieValue, address, options.newDraft === true);
      const result = response({ answers: created.answers, verified: created.verified, status: created.status, reference: created.reference, submittedAt: created.submittedAt });
      result.cookies.set(draftCookie, created.cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 86400 });
      return result;
    }
    const input = await body(request);
    if (action === "otp-send") return response(await startupPublicAdmissions.sendOtp(cookieValue, input, address), 201);
    if (action === "otp-verify") return response(await startupPublicAdmissions.verifyOtp(cookieValue, input, address));
    if (action === "submit") {
      const referral = jar.get("nicejobs_startup_ref")?.value;
      return response(await startupPublicAdmissions.submit(cookieValue, input, referral), 201);
    }
    if (action === "status") return response(await startupPublicAdmissions.status(cookieValue, input));
    return response({ error: "Not found." }, 404);
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { site } = await requestPortal("startup", true);
    if (site.id !== "startup") return response({ error: "Not found." }, 404);
    const { action } = await context.params;
    if (action !== "draft") return response({ error: "Not found." }, 404);
    const cookieValue = (await cookies()).get(draftCookie)?.value;
    return response(await startupPublicAdmissions.updateDraft(cookieValue, await body(request), clientKey(request)));
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { site } = await requestPortal("startup", true);
    if (site.id !== "startup") return response({ error: "Not found." }, 404);
    const { action } = await context.params;
    if (action !== "draft") return response({ error: "Not found." }, 404);
    const jar = await cookies();
    const deleted = await startupPublicAdmissions.deleteDraft(jar.get(draftCookie)?.value);
    const result = response(deleted);
    result.cookies.set(draftCookie, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return result;
  } catch (error) { return apiError(error); }
}
