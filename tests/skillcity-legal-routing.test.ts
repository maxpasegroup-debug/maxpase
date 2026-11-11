import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

const previousSecret = process.env.AUTH_SECRET;
afterEach(() => {
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});

describe("AIRA Skill City public legal host routing", () => {
  it("rewrites all five public policy paths to the Skill City portal", async () => {
    process.env.AUTH_SECRET = "isolated-public-route-test-secret-at-least-32-chars";
    for (const path of ["/terms", "/privacy", "/refund-policy", "/contact", "/grievance"]) {
      const response = await middleware(new NextRequest(`https://airaskillcity.com${path}`, { headers: { host: "airaskillcity.com" } }));
      expect(response.headers.get("x-middleware-rewrite"), path).toContain(`/sites/skillcity${path}`);
      expect(response.headers.get("Vary")).toContain("Host");
      expect(response.headers.get("Cache-Control")).toContain("no-store");
    }
  });

  it("does not open Skill City legal paths on another portal hostname", async () => {
    process.env.AUTH_SECRET = "isolated-public-route-test-secret-at-least-32-chars";
    for (const path of ["/terms", "/privacy", "/refund-policy", "/contact", "/grievance"]) {
      const response = await middleware(new NextRequest(`https://airalabs.online${path}`, { headers: { host: "airalabs.online" } }));
      expect(response.status, path).toBe(404);
    }
  });
});
