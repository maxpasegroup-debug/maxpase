import { PilotFeedbackForm } from "./pilot-feedback-forms";

type OwnFeedback = { id: string; stage: string; status: string; createdAt: Date; response: string | null };
export function PilotFeedbackPanel({ items, enrollmentId }: { items: OwnFeedback[]; enrollmentId?: string }) {
  return <section className="startup-app-card startup-pilot-panel"><p className="startup-kicker">HELP US IMPROVE THE KERALA PILOT</p><h2>Tell us what was difficult</h2><p>Share where the journey was unclear. A person on the programme team will review your note. This does not change your application or learning decision.</p><PilotFeedbackForm enrollmentId={enrollmentId}/>{items.length > 0 && <details><summary>Your recent feedback ({items.length})</summary><ul className="startup-founder-notes">{items.map(item => <li key={item.id}><strong>{item.stage.replaceAll("_", " ")} · {item.status.toLowerCase()}</strong><p>{item.response ?? "Waiting for a team response."}</p><time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleDateString("en-IN")}</time></li>)}</ul></details>}</section>;
}
