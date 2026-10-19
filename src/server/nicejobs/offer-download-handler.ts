import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { siteByHost } from "@/server/portals/sites";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { offerDocumentService } from "./offer-document";
import { AccessError } from "@/server/authorization/engine";
import { z } from "zod";

export async function offerDownload(reference: string, portal: boolean, format: string = "html") {
  try {
    let userId: string;
    if (portal) {
      const { site } = await requestPortal("jobs");
      const session = await getPortalSession(site);
      if (!session) return new NextResponse("Sign in required", { status: 401 });
      userId = session.userId;
    } else {
      if (siteByHost((await headers()).get("host"))) throw new AccessError("Offer unavailable");
      const session = await getSession();
      if (!session) return new NextResponse("Sign in required", { status: 401 });
      userId = session.userId;
    }
    await consumeSecurityBudget(securityKey("offer-download", userId), 30, 60);
    const document = await offerDocumentService.download(userId, reference, z.enum(["html", "eml"]).parse(format));
    return new NextResponse(document.content, { headers: { "Content-Type": document.contentType, "Content-Disposition": `attachment; filename="${document.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } });
  } catch (error) {
    if (error instanceof RateLimitError) return new NextResponse("Too many downloads. Try again later.", { status: 429, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(error instanceof AccessError || error instanceof z.ZodError ? "Offer unavailable" : "Offer download temporarily unavailable", { status: error instanceof AccessError || error instanceof z.ZodError ? 403 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
