import { applicationStatusSteps } from "@/lib/startup-applicant-status";
export function ApplicantStatus({ status }: { status: string }) {
  const steps = applicationStatusSteps(status);
  if (!steps) return <p role="alert">Application progress is unavailable. Contact admissions.</p>;
  return <ol className="startup-application-steps" aria-label="Application progress">{steps.map(item => <li key={item.label} data-state={item.state} aria-current={item.state === "current" ? "step" : undefined}><span aria-hidden="true">{item.number}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ol>;
}
