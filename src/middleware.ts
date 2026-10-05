import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = ["/app"];

export function middleware(request: NextRequest) {
  if (!protectedPrefixes.some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(prefix + "/"))) {
    return NextResponse.next();
  }

  const cookieName = process.env.AUTH_COOKIE_NAME ?? "maxpase_session";
  const hasSessionCookie = Boolean(request.cookies.get(cookieName)?.value);
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"]
};
