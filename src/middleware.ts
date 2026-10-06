import { NextResponse, type NextRequest } from "next/server";
import { siteByHost, portalPaths, hostName } from "./server/portals/sites";
import { signPortalContext, verifyPortalContext } from "./server/portals/context-proof";

const protectedPrefixes = ["/app"];

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-maxpase-portal");
  requestHeaders.delete("x-maxpase-portal-context");
  requestHeaders.set("x-forwarded-host", request.headers.get("host") ?? "");
  const direct = siteByHost(request.headers.get("host"));
  const internalHost = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(hostName(request.headers.get("host")) ?? "");
  const forwarded = !direct && internalHost ? await verifyPortalContext(request.headers.get("x-maxpase-portal-context"), process.env.AUTH_SECRET ?? "") : null;
  const site = direct ?? forwarded?.site;
  if (site) {
    const host = forwarded?.host ?? hostName(request.headers.get("host"))!;
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) return new NextResponse("Gateway configuration unavailable", { status: 503 });
    requestHeaders.set("x-maxpase-portal", site.id);
    requestHeaders.set("x-forwarded-host", host);
    requestHeaders.set("x-maxpase-portal-context", forwarded ? request.headers.get("x-maxpase-portal-context")! : await signPortalContext(site, host, process.env.AUTH_SECRET));
    const prefix = `/sites/${site.id}`;
    const internalPath = !!forwarded && [prefix, prefix + "/login", prefix + "/gateway"].includes(request.nextUrl.pathname);
    const path = internalPath ? request.nextUrl.pathname.slice(prefix.length) || "/" : request.nextUrl.pathname;
    if (["/", "/login", "/gateway"].includes(path)) {
      if (path === "/gateway" && !request.cookies.get(site.cookie)?.value) return NextResponse.redirect(new URL(portalPaths(site).login, "https://" + host));
      const target = request.nextUrl.clone(); target.pathname = `/sites/${site.id}${path === "/" ? "" : path}`;
      const response = internalPath ? NextResponse.next({ request: { headers: requestHeaders } }) : NextResponse.rewrite(target, { request: { headers: requestHeaders } }); response.headers.set("Vary", "Host");
      if (path !== "/") response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    }
    if (!["/api/health", "/api/ready"].includes(path)) return new NextResponse("Not found", { status: 404 });
  }
  if (!protectedPrefixes.some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(prefix + "/"))) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const cookieName = process.env.AUTH_COOKIE_NAME ?? "maxpase_session";
  const hasSessionCookie = Boolean(request.cookies.get(cookieName)?.value);
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"]
};
