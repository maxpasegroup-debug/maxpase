import type { candidateDisclosure } from "@/server/nicejobs/applications";

export function OpportunityDisclosure({ disclosure }: { disclosure: ReturnType<typeof candidateDisclosure> }) {
  if (!disclosure) return <p>Opportunity terms are awaiting confirmation.</p>;
  return <dl className="nj-detail nj-opportunity-disclosure"><dt>Legal employer</dt><dd>{disclosure.legalEmployer ?? "Awaiting verification"}</dd>{disclosure.brand && <><dt>Brand</dt><dd>{disclosure.brand}</dd></>}<dt>Division</dt><dd>{disclosure.division}</dd><dt>Employment type</dt><dd>{disclosure.employmentType.replaceAll("_", " ")}</dd><dt>Eligibility</dt><dd>{disclosure.eligibility}</dd><dt>Compensation</dt><dd>{disclosure.compensation}</dd><dt>Incentives</dt><dd>{disclosure.incentives}</dd><dt>Location</dt><dd>{disclosure.location}</dd><dt>Work arrangement</dt><dd>{disclosure.workArrangement.replaceAll("_", " ")}</dd>{disclosure.reportingManager && <><dt>Reports to</dt><dd>{disclosure.reportingManager}</dd></>}</dl>;
}
