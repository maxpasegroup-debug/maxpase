import { CircleCheck, CircleAlert } from "lucide-react";
import type { ProgrammeChecklist as Checklist } from "@/server/nicejobs/programme-checklist";

export function ProgrammeChecklist({ setup, status, targets = [] }: { setup: Checklist; status: string; targets?: string[] }) {
  if (!setup.required) return null;
  const current = ["REVIEW", "PENDING_VERIFICATION"].includes(status) ? "Ready for review" : status === "DRAFT" ? "Draft" : status === "APPROVED" ? "Approved" : status === "PUBLISHED" ? "Published" : status.replaceAll("_", " ");
  return <section className="nj-programme-checklist" aria-labelledby="programme-heading">
    <header><h2 id="programme-heading">Job and programme setup</h2><span className="nj-setup-status">{current}</span></header>
    <ol className="nj-setup-stages" aria-label="Publication stages">{["Draft", "Ready for review", "Approved", "Published"].map(stage => <li key={stage} aria-current={stage === current ? "step" : undefined}>{stage}</li>)}</ol>
    <p role="status">{setup.ready ? "Required inputs are complete. Publication still requires authorized review and approval." : `${setup.issues.length} requirements outstanding. Review and publication are blocked.`}</p>
    <ul className="nj-setup-items">{setup.items.map(item => <li key={item.key}>
      <div>{item.issues.length ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}<h3>{item.title}</h3><span>{item.issues.length ? "Missing requirements" : "Complete"}</span>{targets.includes(item.target) && <a href={`#${item.target}`} aria-label={`Review ${item.title.toLowerCase()}`}>Review details</a>}</div>
      {!!item.issues.length && <ul>{item.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    </li>)}</ul>
  </section>;
}
