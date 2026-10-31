export const bossDepartments = {
  marketing: { label: "Marketing", modules: ["Campaigns", "Content Calendar", "Creative Management", "Agencies and Vendors", "Marketing Budgets", "Campaign Performance"] },
  hr: { label: "HR", modules: ["Employees", "Recruitment", "Departments and Designations", "Attendance", "Leave Management", "Payroll", "HR Reports"] },
  sales: { label: "Sales", modules: ["CRM and Leads", "Telecalling", "Sales Executives", "Admission Partners", "Institutional Partnerships", "Follow-ups", "Conversion Reports"] },
  finance: { label: "Finance", modules: ["Commercial Terms", "Revenue", "Expenses", "Budgets", "Invoices", "Payments", "Financial Reports"] },
  operations: { label: "Operations", modules: ["Tasks and Work Orders", "Programme/Service Delivery", "Assignments", "Operational Tracking", "Issues and Escalations", "Operations Reports"] },
} as const;

export type BossDepartment = keyof typeof bossDepartments;
export function isBossDepartment(value: string): value is BossDepartment { return Object.hasOwn(bossDepartments, value); }
export function departmentHref(department: BossDepartment, companyId?: string, brandId?: string) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (companyId && brandId) params.set("brandId", brandId);
  return `/app/boss/departments/${department}${params.size ? `?${params}` : ""}`;
}
export function resolveDepartmentSelection<T extends { organizationId: string }, B extends { id: string; organizationId: string }>(companies: readonly T[], brands: readonly B[], companyId?: string, brandId?: string) {
  const company = companyId ? companies.find(row => row.organizationId === companyId) : undefined;
  if (companyId && !company) return null;
  const availableBrands = company ? brands.filter(row => row.organizationId === company.organizationId) : [];
  const brand = brandId ? availableBrands.find(row => row.id === brandId) : undefined;
  if (brandId && !brand) return null;
  return { company, brand, availableBrands };
}
