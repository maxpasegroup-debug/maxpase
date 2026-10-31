import { describe, expect, it } from "vitest";
import { brandOperatingModules } from "@/server/group/brand-os";

describe("Brand operating modules", () => {
  it("opens only authorized, implemented Startup Skool destinations", () => {
    const modules = brandOperatingModules({ startup: true, programs: true, products: true, projects: false, people: false, approvals: false });
    expect(modules.find(module => module.key === "programs")).toMatchObject({ href: "#programs" });
    for (const key of ["admissions", "learners", "crm", "finance", "marketing", "sales", "partners", "delivery"]) {
      expect(modules.find(module => module.key === key)?.href).toBeNull();
    }
  });

  it("keeps other brands on the reusable shell without claiming integrations or finance", () => {
    const modules = brandOperatingModules({ startup: false, programs: false, products: false, projects: true, people: false, approvals: true });
    expect(modules.find(module => module.key === "operations")?.href).toBe("#projects");
    expect(modules.find(module => module.key === "products")?.href).toBeNull();
    expect(modules.find(module => module.key === "finance")?.href).toBeNull();
    expect(modules.find(module => module.key === "decisions")?.href).toBe("#decisions");
  });
  it("opens Skill Studio programmes only when the scoped registry is authorized", () => {
    const base = { startup: false, programs: true, products: true, projects: false, people: false, approvals: false };
    expect(brandOperatingModules(base).some(module => module.key === "programs")).toBe(false);
    expect(brandOperatingModules({ ...base, studioProgramsHref: "/app/aira/programs?organizationId=studio" }).find(module => module.key === "programs")?.href).toBe("/app/aira/programs?organizationId=studio");
  });
  it("opens reporting and commercial controls only when their source workspace is authorized", () => {
    const modules = brandOperatingModules({ startup: true, programs: true, products: true, projects: true, people: false, approvals: false, commercialHref: "/app/boss/brands/startup/commercial", reportsHref: "#reporting" });
    expect(modules.find(module => module.key === "finance")?.href).toBe("/app/boss/brands/startup/commercial");
    expect(modules.find(module => module.key === "reports")?.href).toBe("#reporting");
    expect(brandOperatingModules({ startup: true, programs: false, products: false, projects: false, people: false, approvals: false }).find(module => module.key === "finance")?.href).toBeNull();
  });
});
