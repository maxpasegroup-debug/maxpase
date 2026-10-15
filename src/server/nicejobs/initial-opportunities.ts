import type { OpportunityConfiguration } from "./opportunity-configuration";

export function initialOpportunities(companyId: string, legalName: string, labsBrandId: string) {
  const base: OpportunityConfiguration = {
    legalEmployer: { organizationId: companyId, label: legalName, legalName, status: "CONFIRMED", evidence: "Owner supplied employer confirmation, 2026-10-10; this is not a registry verification." },
    brandId: null, brandLabel: null, divisionLabel: "Academic Advisory / Admissions", divisionStatus: "PENDING", employmentType: "PENDING",
    eligibility: "Communication skills, basic digital literacy, and willingness to learn counselling and sales. Freshers may apply.",
    compensation: { status: "PENDING", text: "Performance-based. No fixed salary intended under the proposed model, subject to applicable legal requirements. Commission rates, verification rules and payment schedule are pending configuration." },
    incentives: { status: "PENDING", text: null }, location: { status: "PENDING", text: null }, workArrangement: "PENDING",
    reportingManager: { personId: null, roleLabel: "Academic Advisory Head / Admissions Manager" }
  };
  return [
    { code: "JOB-001", title: "Junior Academic Advisor", engagement: "PERFORMANCE_BASED", slugs: ["aira-startup-school", "aira-skill-studio"], description: "Counsel prospective students, explain programs, manage leads, follow up with prospects, maintain CRM records, and support admission conversion.", opportunity: base },
    { code: "JOB-BAM", title: "Business Automation Manager", engagement: "NOT_CONFIRMED", slugs: ["aira-labs"], description: "Identify business automation opportunities, map workflows, coordinate AI and software implementations, integrate business tools, and support client onboarding and delivery.", opportunity: { ...base, brandId: labsBrandId, brandLabel: "AIRA Labs", divisionLabel: "AIRA Labs", divisionStatus: "CONFIRMED", eligibility: "Understanding of business processes, AI applications, automation tools, CRM systems, and workflow design. Relevant project experience desirable.", compensation: { status: "PENDING", text: null }, reportingManager: { personId: null, roleLabel: "AIRA Labs Division Head / Technology & Automation Lead" } } satisfies OpportunityConfiguration },
    { code: "JOB-DCM", title: "Defence Career Mentor", engagement: "NOT_CONFIRMED", slugs: ["aira-career-hub"], description: "Guide defence-career aspirants, explain preparation programs and admission procedures, support candidate follow-ups, and help learners understand their preparation pathway.", opportunity: { ...base, legalEmployer: { organizationId: null, label: "Nidus Academy", legalName: null, status: "PENDING_VERIFICATION", evidence: null }, divisionLabel: "Nidus Academy", eligibility: "Communication and mentoring skills, interest in defence careers, and ability to explain program information accurately.", compensation: { status: "PENDING", text: null }, reportingManager: { personId: null, roleLabel: "Nidus Academy Academic / Defence Training Head" } } satisfies OpportunityConfiguration }
  ];
}
