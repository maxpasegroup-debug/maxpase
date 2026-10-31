import { randomUUID } from "node:crypto";
import type { advisorCrm } from "@/server/skillcity/crm";
import { WorkForm } from "./work-form";

type Pipeline = { slug: string } & Awaited<ReturnType<typeof advisorCrm.list>>;
const labels: Record<string, string> = { pba: "PBA / Startup Skool", "genz-builder": "GenZ Builder / Skill Studio" };
const next: Record<string, string[]> = { NEW: ["NEW", "CONTACTED", "LOST"], CONTACTED: ["CONTACTED", "QUALIFIED", "LOST"], QUALIFIED: ["QUALIFIED", "LOST"] };
const date = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "Not scheduled";

export function AdvisorPipelines({ pipelines }: { pipelines: Pipeline[] }) {
  return <>{pipelines.map(pipeline => <section className="sc-section" key={pipeline.slug}>
    <h2>{labels[pipeline.slug] ?? pipeline.slug}</h2>
    <p>{pipeline.product ? `${pipeline.rows.length} assigned records on this page. Product: ${pipeline.product.lifecycle} / ${pipeline.product.status}.` : "Product pipeline not configured."}</p>
    {pipeline.unavailableRecords > 0 && <p>{pipeline.unavailableRecords} record(s) need data review before they can be shown in this pipeline.</p>}
    {pipeline.product && !pipeline.rows.length && <p>No assigned open records.</p>}
    {pipeline.product && !!pipeline.rows.length && <div className="sc-list">{pipeline.rows.map(lead => <article id={`${pipeline.slug}-lead-${lead.id}`} key={lead.id}>
      <header><h3>{lead.title}</h3><span>{lead.status.replaceAll("_", " ")}</span></header>
      <p>Next follow-up: {date(lead.nextFollowUp ?? lead.dueAt)}</p><p>Last outcome: {lead.outcome || "Not recorded"}</p>
      {pipeline.canUpdate && next[lead.status] && <details><summary>Record outcome and next action</summary>
        <WorkForm actionName="CRM_LEAD" reference={randomUUID()} label="Save follow-up">
          <input type="hidden" name="id" value={lead.id}/><input type="hidden" name="version" value={lead.version}/>
          <label>Status<select name="status" defaultValue={lead.status}>{next[lead.status].map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
          <label>Outcome<textarea name="outcome" required maxLength={3000} defaultValue={lead.outcome}/></label>
          <label>Qualification evidence<textarea name="qualification" maxLength={3000} defaultValue={lead.qualification}/></label>
          <label>Next follow-up (your local time)<input name="nextFollowUp" type="datetime-local"/></label>
        </WorkForm>
      </details>}
    </article>)}</div>}
    <p className="muted">Qualification is an internal record. No offer, sale or payment is issued from this pipeline.</p>
  </section>)}</>;
}
