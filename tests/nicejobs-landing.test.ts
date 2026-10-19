import { describe, expect, it } from "vitest";
import { opportunityPreview } from "../src/app/sites/jobs-ui/landing-data";
import { portalPaths, siteById } from "../src/server/portals/sites";

describe("Nice Jobs landing", () => {
  it("uses the existing portal routes", () => {
    const paths = portalPaths(siteById("jobs")!, true);
    expect(paths.opportunities).toBe("/sites/jobs/opportunities");
    expect(paths.login).toBe("/sites/jobs/login");
    expect(paths.signup).toBe("/sites/jobs/signup");
  });

  it("distinguishes an empty catalogue from unavailable data", () => {
    expect(opportunityPreview("ready", [])).toEqual({ state: "empty", opportunities: [] });
    expect(opportunityPreview("unavailable", [])).toEqual({ state: "unavailable", opportunities: [] });
  });

  it("does not display any listing when its source is unavailable", () => {
    const draft = { id: "draft", title: "Unverified role", employer: "Unverified", areas: [] };
    expect(opportunityPreview("unavailable", [draft])).toEqual({ state: "unavailable", opportunities: [] });
  });

  it("preserves the published listings supplied by the application service", () => {
    const published = { id: "published", title: "Verified pilot role", employer: "Verified employer", areas: ["Remote"] };
    expect(opportunityPreview("ready", [published])).toEqual({ state: "published", opportunities: [published] });
  });
});
