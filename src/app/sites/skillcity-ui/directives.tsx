import { randomUUID } from "node:crypto";
import { nexaService } from "@/server/group/nexa-service";
import { AccessError } from "@/server/authorization/engine";
import { WorkForm } from "./work-form";

type Preparation = { facts?: { label: string; value: unknown }[]; recommendations?: { observation: string; recommendation: string }[]; limitations?: string[] };

export async function DirectorDirectives({ userId, organizationId }: { userId: string; organizationId: string }) {
  let desk;
  try { desk = await nexaService.directorDesk(userId, organizationId); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <section className="sc-section"><h2>SIA guidance</h2><p>Director directives are unavailable until your verified appointment and decision authority are recorded.</p></section>;
  }
  return <section className="sc-section"><h2>SIA guidance and director directives</h2><p>Company-scoped briefs require your decision. A preparation is read-only; approval alone never executes a task.</p>
    {desk.rows.length === 0 && <p>No assigned directives.</p>}
    <div className="sc-list">{desk.rows.map(row => {
      let preparation: Preparation | null = null;
      try { preparation = row.siaPreparation ? JSON.parse(row.siaPreparation) as Preparation : null; } catch { preparation = null; }
      return <article key={row.id}><header><h3>Director brief</h3><span>{row.status.replaceAll("_", " ")}</span></header><p>{row.directorBrief}</p><p>Source: group instruction / Scope: current company / Responsible human: you</p>
        {row.status === "DIRECTOR_REVIEW" && (desk.sia.length ? <WorkForm actionName="DIRECTIVE_PREPARE" reference={randomUUID()} label="Prepare with SIA"><input type="hidden" name="id" value={row.id}/><input type="hidden" name="version" value={row.version}/><label>Authorized SIA identity<select name="siaId" required>{desk.sia.map(sia => <option key={sia.id} value={sia.id}>{sia.name}</option>)}</select></label></WorkForm> : <p>SIA preparation unavailable: no authorized read-only company tool is configured.</p>)}
        {preparation && <div><h4>SIA preparation</h4><p>Read-only evidence and draft guidance; verify before deciding.</p>{preparation.facts?.map((fact, index) => <p key={index}>{fact.label}: {String(fact.value)}</p>)}{preparation.recommendations?.map((item, index) => <p key={index}>{item.observation} / {item.recommendation}</p>)}{preparation.limitations?.map((item, index) => <p key={index}>Limit: {item}</p>)}</div>}
        {row.status === "PREPARED" && !row.preparationCurrent && <p>SIA preparation is no longer authorized. The director decision is blocked until the current tool authority is restored and the evidence is reviewed.</p>}
        {row.status === "PREPARED" && row.preparationCurrent && <WorkForm actionName="DIRECTIVE_DECIDE" reference={randomUUID()} label="Record decision" confirm="Record your decision? This does not execute a task."><input type="hidden" name="id" value={row.id}/><input type="hidden" name="version" value={row.version}/><label>Decision<select name="decision"><option value="APPROVED">Approve preparation</option><option value="REJECTED">Reject</option></select></label><label>Reason<textarea name="reason" minLength={10} maxLength={2000} required/></label></WorkForm>}
        {row.status === "DIRECTOR_APPROVED" && (desk.controls.length ? <WorkForm actionName="DIRECTIVE_TASK" reference={randomUUID()} label="Request independent approval" confirm="Submit this task proposal for independent approval?"><input type="hidden" name="id" value={row.id}/><input type="hidden" name="version" value={row.version}/><label>Control point<select name="controlPointId" required>{desk.controls.map(control => <option key={control.id} value={control.id}>{control.name}</option>)}</select></label><label>Task title<input name="title" maxLength={200} required/></label><label>Task detail<textarea name="description" maxLength={4000}/></label><label>Due date<input name="dueDate" type="date"/></label><label>Priority<select name="priority"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="LOW">Low</option><option value="CRITICAL">Critical</option></select></label></WorkForm> : <p>No authorized independent task-approval control point is configured.</p>)}
        {row.decisionReason && <p>Decision reason: {row.decisionReason}</p>}{row.action && <p>Controlled action: {row.action.status.replaceAll("_", " ")} / Approval: {row.action.request?.status ?? "Unavailable"}. Execution remains a separate confirmed step.</p>}<p>Outcome: {row.outcome.replaceAll("_", " ")}</p>
      </article>;
    })}</div>
  </section>;
}
