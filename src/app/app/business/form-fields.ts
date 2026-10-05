import type { BusinessKind } from "@/server/domain/business-input";
export type Field = { key: string; label: string; type?: "text" | "date" | "number" | "email" | "url" | "textarea"; required?: boolean; options?: string[]; source?: "organizations" | "groups" | "companies" | "people" | "brands" | "products" | "projects"; min?: number; max?: number };
const name: Field = { key: "name", label: "Name", required: true };
const slug: Field = { key: "slug", label: "Identity", required: true };
const description: Field = { key: "description", label: "Description", type: "textarea" };
const status: Field = { key: "status", label: "Status", options: ["ACTIVE", "INACTIVE", "ARCHIVED"] };
const org: Field = { key: "organizationId", label: "Organization", source: "organizations", required: true };
const metadata: Field = { key: "metadata", label: "Metadata (JSON)", type: "textarea" };
const priority: Field = { key: "priority", label: "Priority", options: ["NORMAL", "LOW", "HIGH", "CRITICAL"] };
const owner: Field = { key: "ownerPersonId", label: "Owner", source: "people" };
const product: Field = { key: "productId", label: "Product", source: "products" };
const brand: Field = { key: "brandId", label: "Brand", source: "brands" };
const target: Field = { key: "targetDate", label: "Target date", type: "date" };
export const fields: Record<BusinessKind, Field[]> = {
 groups: [name, slug, description, status, metadata],
 companies: [name, slug, { key: "legalName", label: "Legal name" }, { key: "groupOrganizationId", label: "Group", source: "groups" }, { key: "shortName", label: "Short name" }, { key: "companyType", label: "Company type" }, { key: "country", label: "Country" }, { key: "region", label: "Region" }, description, status, { key: "identifiers", label: "Documented identifiers (JSON)", type: "textarea" }, metadata],
 organizations: [name, slug, { key: "parentId", label: "Parent organization", source: "organizations", required: true }, { key: "type", label: "Organization type", options: ["DIVISION", "BUSINESS_UNIT", "DEPARTMENT", "TEAM", "OTHER"] }, description, status, metadata],
 relationships: [{ key: "fromCompanyId", label: "From company", source: "companies", required: true }, { key: "toCompanyId", label: "To company", source: "companies", required: true }, { key: "relationship", label: "Relationship", options: ["SUBSIDIARY", "PARENT", "AFFILIATE", "JOINT_VENTURE", "CONTROLLED_ENTITY", "EMPLOYER", "OTHER"] }, status, metadata],
 ownership: [{ key: "companyId", label: "Company", source: "companies", required: true }, { key: "ownerPersonId", label: "Person owner", source: "people" }, { key: "ownerOrgId", label: "Organization owner", source: "organizations" }, { key: "percentage", label: "Ownership percentage", type: "number", min: 0, max: 100 }, { key: "ownershipType", label: "Ownership type", options: ["UNSPECIFIED", "EQUITY", "BENEFICIAL", "VOTING", "OTHER"] }, { key: "effectiveFrom", label: "Effective from", type: "date" }, { key: "effectiveTo", label: "Effective to", type: "date" }, status, { key: "notes", label: "Notes", type: "textarea" }, metadata],
 people: [org, { key: "displayName", label: "Display name", required: true }, { key: "legalName", label: "Legal name" }, { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone" }],
 memberships: [org, { key: "personId", label: "Person", source: "people", required: true }, { key: "title", label: "Title" }, { key: "status", label: "Status", options: ["ACTIVE", "INVITED", "SUSPENDED", "ENDED"] }, { key: "scope", label: "Membership scope", options: ["ORGANIZATION", "DESCENDANTS"] }, { key: "startDate", label: "Start date", type: "date" }, { key: "endDate", label: "End date", type: "date" }, metadata],
 brands: [name, slug, org, description, { key: "website", label: "Website", type: "url" }, status, metadata],
 products: [name, slug, org, brand, { key: "type", label: "Type", options: ["PRODUCT", "SERVICE", "PLATFORM"] }, { key: "lifecycle", label: "Lifecycle", options: ["CONCEPT", "DEVELOPMENT", "LIVE", "RETIRED"] }, description, status, metadata],
 projects: [name, slug, org, brand, product, owner, description, priority, { key: "startDate", label: "Start date", type: "date" }, target, status, metadata],
 goals: [{ key: "title", label: "Objective", required: true }, org, { key: "projectId", label: "Project", source: "projects" }, product, owner, description, priority, target, { key: "progress", label: "Progress (%)", type: "number", min: 0, max: 100 }, { key: "status", label: "Status", options: ["DRAFT", "ACTIVE", "PAUSED", "ACHIEVED", "CANCELED"] }, metadata]
};
