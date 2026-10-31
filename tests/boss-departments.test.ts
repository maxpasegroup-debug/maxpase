import { describe, expect, it } from "vitest";
import { departmentHref, isBossDepartment, resolveDepartmentSelection } from "../src/lib/boss-departments";

const companies = [{ organizationId: "company-a" }, { organizationId: "company-b" }];
const brands = [{ id: "brand-a", organizationId: "company-a" }, { id: "brand-b", organizationId: "company-b" }];

describe("Boss department navigation", () => {
  it("requires a known department and preserves explicit company and brand context", () => {
    expect(isBossDepartment("marketing")).toBe(true);
    expect(isBossDepartment("unknown")).toBe(false);
    expect(departmentHref("marketing", "company-a", "brand-a")).toBe("/app/boss/departments/marketing?companyId=company-a&brandId=brand-a");
    expect(departmentHref("hr", "company-b")).toBe("/app/boss/departments/hr?companyId=company-b");
  });
  it("shows only the selected company's brands and rejects a foreign brand", () => {
    expect(resolveDepartmentSelection(companies, brands, "company-a")?.availableBrands).toEqual([brands[0]]);
    expect(resolveDepartmentSelection(companies, brands, "company-a", "brand-b")).toBeNull();
    expect(resolveDepartmentSelection(companies, brands, "missing")).toBeNull();
    expect(resolveDepartmentSelection(companies, brands, undefined, "brand-a")).toBeNull();
    expect(resolveDepartmentSelection(companies, brands, "company-a", "brand-a")?.brand).toEqual(brands[0]);
  });
});
