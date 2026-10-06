import type { NextConfig } from "next";
import { portalSites } from "./src/server/portals/sites";

const nextConfig: NextConfig = {
  distDir: process.env.MAXPASE_PORTAL_SMOKE === "true" && process.env.NODE_ENV !== "production" ? ".next-portal-smoke" : ".next",
  experimental: { serverActions: { allowedOrigins: ["maxpase.com", "www.maxpase.com", ...portalSites.flatMap(s => [s.domain, "www." + s.domain])] } },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" }
    ] }, { source: "/app/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] }];
  }
};

export default nextConfig;
