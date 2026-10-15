import { randomUUID } from "node:crypto";
import type { advisorCrm } from "@/server/skillcity/crm";
import { WorkForm } from "./work-form";

type Pipeline = Awaited<ReturnType<typeof advisorCrm.list>>;
type Managed = { slug: string; label: string; owners: { id: string; email: string }[]; pipeline: Pipeline };
const next: Record<string, string[]> = { NEW: ["NEW", "CONTACTED", "LOST"], CONTACTED: ["CONTACTED", "QUALIFIED", "LOST"], QUALIFIED: ["QUALIFIED", "LOST"] };

export function DirectorCrm({ pipelines }: { pipelines: Managed[] }) {
  return <section className="sc-section"><h2>Advisory pipelines</h2>
    {!pipelines.length && <p>No product pipeline management is authorized for this account.</p>}
    {pipelines.map(item => <section key={item.slug} className="sc-pipeline-management"><h3>{item.label}</h3>
      <p>{item.pipeline.product ? `${item.pipeline.rows.length} open records in this page / ${item.pipeline.product.lifecycle}` : "Product configuration unavailable"}</p>
      {item.pipeline.product && !!item.owners.length && <details><summary>Add a consented enquiry</summary><WorkForm actionName="CRM_CREATE" reference={randomUUID()} label="Assign enquiry">
        <input type="hidden" name="product" value={item.slug}/>
        <label>Advisor<select name="ownerUserId" required><option value="">Choose a verified advisor</option>{item.owners.map(owner => <option key={owner.id} value={owner.id}>{owner.email}</option>)}</select></label>
        <label>Contact name<input name="name" minLength={2} maxLength={160} required/></label>
        <label>Email<input type="email" name="email" maxLength={254} required/></label>
        <label>Phone<input name="phone" maxLength={30}/></label>
        <label>Need<textarea name="need" minLength={10} maxLength={3000} required/></label>
        <label><input type="checkbox" name="consent" value="true" required/> Contact consent has been recorded</label>
      </WorkForm></details>}
      {item.pipeline.product && !item.owners.length && <p>No verified advisor with this division&apos;s CRM permission is available for assignment.</p>}
      {item.pipeline.rows.map(row => <article key={row.id} className="sc-task"><strong>{row.title}</strong><p>{row.status} / Owner: {item.owners.find(owner => owner.id === row.ownerUserId)?.email ?? "Owner unavailable"}</p><p>Next action: {row.outcome || "Not recorded"}</p>
        {item.pipeline.canUpdate && next[row.status] && <details><summary>Record manager intervention</summary><WorkForm actionName="CRM_LEAD" reference={randomUUID()} label="Save intervention">
          <input type="hidden" name="id" value={row.id}/><input type="hidden" name="version" value={row.version}/>
          <label>Status<select name="status" defaultValue={row.status}>{next[row.status].map(status => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Outcome<textarea name="outcome" minLength={1} maxLength={3000} defaultValue={row.outcome} required/></label>
          <label>Qualification evidence<textarea name="qualification" maxLength={3000} defaultValue={row.qualification}/></label>
          <label>Next follow-up (your local time)<input name="nextFollowUp" type="datetime-local"/></label>
        </WorkForm></details>}
      </article>)}
    </section>)}
    <p className="muted">Only internal qualification and follow-up actions are enabled. Product publication and commercial decisions remain separately controlled.</p>
  </section>;
}
