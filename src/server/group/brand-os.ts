export type BrandModule = { key: string; label: string; href: string | null; note: string };

export function brandOperatingModules(input: {
  startup: boolean;
  programs: boolean;
  products: boolean;
  projects: boolean;
  people: boolean;
  approvals: boolean;
  admissionsHref?: string;
  marketingHref?: string;
  commercialHref?: string;
  reportsHref?: string;
}): BrandModule[] {
  const available = (key: string, label: string, href: string, enabled: boolean, note = "Authorized workspace") =>
    ({ key, label, href: enabled ? href : null, note: enabled ? note : "Not authorized" });
  const unconnected = (key: string, label: string) => ({ key, label, href: null, note: "Not connected in this brand center" });
  if (input.startup) return [
    available("overview", "Overview", "#overview", true),
    available("programs", "Program Management", "#programs", input.programs, "Recorded programmes and their current states"),
    available("admissions", "Admissions", input.admissionsHref ?? "#admissions", !!input.admissionsHref, "Submitted applications and human decisions"),
    unconnected("learners", "Applicants and Learners"),
    unconnected("crm", "CRM and Communication"),
    available("people", "HR and Employees", "#people", input.people, "Shared, permission-controlled people workspace"),
    unconnected("mentors", "Mentors"),
    available("marketing", "Marketing", input.marketingHref ?? "#marketing", !!input.marketingHref, "Brand-scoped campaigns and internal review"),
    unconnected("sales", "Sales"),
    unconnected("partners", "Admission and B2B Partners"),
    available("finance", "Commercial controls", input.commercialHref ?? "#commercial", !!input.commercialHref, "Written terms proposals and recorded decisions; no payment authority"),
    unconnected("delivery", "Learning Delivery and Operations"),
    available("reports", "Operating report", input.reportsHref ?? "#reporting", !!input.reportsHref, "Source-linked records and explicit coverage"),
    unconnected("settings", "Settings and Audit")
  ];
  return [
    available("overview", "Overview", "#overview", true),
    available("products", "Programs, Products and Services", "#products", input.products),
    unconnected("crm", "CRM"),
    available("people", "People and HR", "#people", input.people),
    unconnected("finance", "Finance"),
    available("marketing", "Marketing", input.marketingHref ?? "#marketing", !!input.marketingHref, "Brand-scoped campaigns and internal review"),
    unconnected("sales", "Sales"),
    unconnected("partnerships", "Partnerships"),
    available("operations", "Operations and Delivery", "#projects", input.projects),
    available("reports", "Operating report", input.reportsHref ?? "#reporting", !!input.reportsHref, "Source-linked records and explicit coverage"),
    unconnected("settings", "Settings, Permissions and Audit"),
    available("decisions", "Decisions", "#decisions", input.approvals)
  ];
}
