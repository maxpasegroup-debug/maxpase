"use client";
import { useActionState } from "react";
import type { createStartupCentreDesk } from "@/server/skillcity/startup-centre-desk";
import { startupOpsAction, type StartupOpsActionState } from "./startup-operations-actions";

type Data = Awaited<ReturnType<ReturnType<typeof createStartupCentreDesk>["workspace"]>>;
const empty: StartupOpsActionState = {};
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
const date = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not scheduled";
const transitions: Record<string, { value: string; text: string; approval?: boolean }[]> = {
  PROPOSED: [{ value: "UNDER_REVIEW", text: "Send to review" }],
  UNDER_REVIEW: [{ value: "APPROVED", text: "Approve proposal / commitment", approval: true }, { value: "DECLINED", text: "Decline proposal", approval: true }],
  APPROVED: [{ value: "SETUP", text: "Begin setup" }],
  SETUP: [{ value: "OPENING_REVIEW", text: "Request opening readiness review" }],
  OPENING_REVIEW: [{ value: "ACTIVE", text: "Approve opening", approval: true }],
  ACTIVE: [{ value: "RENEWAL_REVIEW", text: "Start renewal review" }, { value: "CLOSURE_REVIEW", text: "Propose closure" }],
  RENEWAL_REVIEW: [{ value: "ACTIVE", text: "Approve renewal", approval: true }, { value: "CLOSURE_REVIEW", text: "Propose closure" }],
  CLOSURE_REVIEW: [{ value: "CLOSED", text: "Approve closure", approval: true }],
};

function ActionStatus({ state }: { state: StartupOpsActionState }) { return state.error ? <p className="sc-ops-error" role="alert">{state.error}</p> : state.message ? <p className="sc-ops-success" role="status">{state.message}</p> : null; }

function ProposalForm({ data }: { data: Data }) {
  const [state, action, pending] = useActionState(startupOpsAction, empty);
  if (!data.canManage) return null;
  return <details className="sc-centre-proposal"><summary>Propose a centre</summary><form action={action} className="sc-ops-form" encType="multipart/form-data"><input type="hidden" name="action" value="CENTRE_PROPOSE"/>
    <label>Centre name<input name="name" required minLength={3} maxLength={140} placeholder="For example, Kozhikode Community Centre"/></label>
    <label>Centre type<select name="type"><option value="COMMUNITY_CENTRE">Community centre</option><option value="TRAINING_CENTRE">Training centre</option><option value="CAMPUS">Campus</option><option value="OTHER">Other</option></select></label>
    <label>State<input name="state" required maxLength={100}/></label><label>District<input name="district" required maxLength={100}/></label>
    <label className="sc-ops-wide">Proposed location / address<textarea name="proposedLocation" required minLength={6} maxLength={500} rows={2}/></label>
    <label>Property arrangement<select name="tenure"><option value="RENT">Rent</option><option value="LEASE">Lease</option><option value="PURCHASE">Purchase</option><option value="EXISTING">Existing site</option><option value="PARTNER">Partner premises</option></select></label>
    <label>Proposed lease term (if applicable)<input name="leaseTerm" maxLength={120} placeholder="For example, 3 years"/></label>
    <label>Expected one-time setup cost (INR)<input name="expectedSetupCost" inputMode="decimal" placeholder="Planning estimate"/></label><label>Expected recurring cost (INR / month)<input name="expectedRecurringCost" inputMode="decimal" placeholder="Planning estimate"/></label>
    <label className="sc-ops-wide">Commitment details<textarea name="commitmentDetails" maxLength={2000} rows={3} placeholder="Proposed rent / deposit / lease terms / purchase terms / partner arrangement"/></label>
    <label>Expected opening date<input name="expectedOpeningDate" type="date"/></label><label>Lease / property end date<input name="propertyEndDate" type="date"/></label>
    <label>Centre manager<select name="centreManagerUserId" defaultValue=""><option value="">Assign later</option>{data.managers.map(person=><option key={person.userId} value={person.userId}>{person.name}{person.email?` · ${person.email}`:""}</option>)}</select></label>
    <label className="sc-ops-wide">Supporting documents (PDF/image, up to 8 files, 20 MB each)<input name="documents" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple/></label>
    <label className="sc-ops-wide">Proposal notes<textarea name="notes" required minLength={10} maxLength={4000} rows={3} placeholder="Explain the need, expected capacity and key site considerations."/></label>
    <p className="sc-ops-wide sc-centre-gate">Rent, lease, purchase and partner proposals require supporting documents and authorized approval before they can be treated as approved. Cost amounts are planning estimates only.</p>
    <div className="sc-ops-wide"><button disabled={pending}>{pending ? "Saving proposal…" : "Save proposal for review"}</button><ActionStatus state={state}/></div>
  </form></details>;
}

function CentreTransitionForm({ data, centre }: { data: Data; centre: Data["centres"][number] }) {
  const [state, action, pending] = useActionState(startupOpsAction, empty);
  const options = (transitions[centre.status] ?? []).filter(option => option.approval ? data.canApprove : data.canManage);
  if (!options.length) return null;
  const opening = centre.status === "SETUP";
  return <form className="sc-centre-transition" action={action}><input type="hidden" name="action" value="CENTRE_TRANSITION"/><input type="hidden" name="id" value={centre.id}/><input type="hidden" name="version" value={centre.version}/>
    <label>Next lifecycle step<select name="status" required defaultValue="">{options.map(option=><option key={option.value} value={option.value}>{option.text}</option>)}</select></label>
    {opening&&<label>Opening readiness summary<textarea name="readinessNote" required minLength={8} maxLength={1000} rows={2} placeholder="Confirm premises, safety, staffing, documents and readiness to open."/></label>}
    <label>Reason / decision note<textarea name="reason" required minLength={8} maxLength={1000} rows={2} placeholder="Add the reason. Approval and lifecycle actions are recorded."/></label>
    <button disabled={pending}>{pending ? "Saving…" : "Save lifecycle update"}</button><ActionStatus state={state}/>
  </form>;
}

function SetupTasks({ data, centre }: { data: Data; centre: Data["centres"][number] }) {
  const [state, action, pending] = useActionState(startupOpsAction, empty);
  if (centre.status !== "SETUP") return centre.setupTasks.length ? <div className="sc-centre-tasks"><b>Setup tasks</b>{centre.setupTasks.map(task=><p key={task.id}>{task.completedAt ? "✓" : "○"} {task.title} {task.owner&&`· ${task.owner}`} {task.dueAt&&`· Due ${date(task.dueAt)}`}</p>)}</div> : null;
  return <div className="sc-centre-tasks"><b>Setup tasks · {centre.setupTasks.filter(task=>task.completedAt).length}/{centre.setupTasks.length} done</b>{centre.setupTasks.map(task=><div className="sc-centre-task" key={task.id}><span>{task.completedAt ? "✓" : "○"} {task.title}{task.owner&&` · ${task.owner}`}{task.dueAt&&` · Due ${date(task.dueAt)}`}</span>{data.canManage&&!task.completedAt&&<form action={action}><input type="hidden" name="action" value="CENTRE_COMPLETE_TASK"/><input type="hidden" name="id" value={centre.id}/><input type="hidden" name="version" value={centre.version}/><input type="hidden" name="taskId" value={task.id}/><button disabled={pending}>Complete</button></form>}</div>)}
    {data.canManage&&<form className="sc-centre-add-task" action={action}><input type="hidden" name="action" value="CENTRE_ADD_TASK"/><input type="hidden" name="id" value={centre.id}/><input type="hidden" name="version" value={centre.version}/><label>New setup task<input name="taskTitle" required minLength={3} maxLength={180}/></label><label>Owner / team<input name="taskOwner" maxLength={120}/></label><label>Due date<input name="taskDueAt" type="datetime-local"/></label><button disabled={pending}>Add task</button><ActionStatus state={state}/></form>}</div>;
}

export function StartupCentresWorkspace({ data, base }: { data: Data; base: string }) {
  const proposalCount = data.centres.filter(centre=>["PROPOSED","UNDER_REVIEW"].includes(centre.status)).length;
  return <section className="sc-section sc-centres" id="startup-centres"><div className="sc-startup-ops-top"><div><p className="sc-centre-eyebrow">CENTRAL · STATE · DISTRICT · CENTRE</p><h2>Centres &amp; expansion</h2><p>Follow each physical site from proposal through setup, opening, operations, renewal or closure.</p></div><span>{data.centres.length} centres</span></div>
    {data.canManage&&<ProposalForm data={data}/>}
    {!data.canRead ? <p className="sc-ops-empty">Centre records are limited to authorized Startup Skool staff.</p> : <>
      <div className="sc-startup-ops-cards"><article><strong>{data.centres.length}</strong><span>Sites in register</span></article><article><strong>{proposalCount}</strong><span>Proposals to review</span></article><article><strong>{data.centres.filter(c=>c.status==="SETUP").length}</strong><span>In setup</span></article><article><strong>{data.centres.filter(c=>c.status==="ACTIVE").length}</strong><span>Active centres</span></article><article><strong>{data.centres.filter(c=>["RENEWAL_REVIEW","CLOSURE_REVIEW"].includes(c.status)).length}</strong><span>Renewal / closure review</span></article></div>
      {data.centres.length ? <div className="sc-ops-list">{data.centres.map(centre=><details className="sc-ops-item sc-centre-item" key={centre.id}><summary><span><b>{centre.name}</b><small>{label(centre.type)} · {centre.district}, {centre.state} · {label(centre.tenure)}</small></span><span className="sc-ops-summary-status">{label(centre.status)}<small>Manager: {centre.centreManagerName}</small></span></summary><div className="sc-ops-detail">
        <dl><div><dt>Location</dt><dd>{centre.proposedLocation}</dd></div><div><dt>Property arrangement</dt><dd>{label(centre.tenure)}{centre.leaseTerm?` · ${centre.leaseTerm}`:""}</dd></div><div><dt>Expected setup cost</dt><dd>{centre.expectedSetupCost?`₹${Number(centre.expectedSetupCost).toLocaleString("en-IN")}`:"Not estimated"}</dd></div><div><dt>Expected recurring cost</dt><dd>{centre.expectedRecurringCost?`₹${Number(centre.expectedRecurringCost).toLocaleString("en-IN")} / month`:"Not estimated"}</dd></div><div><dt>Expected opening</dt><dd>{centre.expectedOpeningDate||"Not scheduled"}</dd></div><div><dt>Lease / property end</dt><dd>{centre.propertyEndDate||"Not recorded"}</dd></div><div><dt>Centre manager</dt><dd>{centre.centreManagerName}{centre.centreManagerEmail?` · ${centre.centreManagerEmail}`:""}</dd></div></dl>
        <p>{centre.notes}</p>{centre.commitmentDetails&&<div className="sc-centre-commitment"><b>Proposed property commitment</b><p>{centre.commitmentDetails}</p><small>Proposal only. No rent, lease, purchase or spend is approved unless the record shows the authorized approval step.</small></div>}
        {centre.attachments.length>0&&<div><b>Site documents</b><ul>{centre.attachments.map((file,index)=><li key={file}><a href={`${base.startsWith("/sites/")?"/sites/skillcity":""}/operations-files/${encodeURIComponent(file)}?centreId=${encodeURIComponent(centre.id)}`} target="_blank" rel="noreferrer">Open supporting document {index+1}</a></li>)}</ul></div>}
        <SetupTasks data={data} centre={centre}/><CentreTransitionForm data={data} centre={centre}/>
        <div><b>Lifecycle &amp; approval history</b>{centre.history.length?<ol className="sc-ops-history">{centre.history.map((event,index)=><li key={`${event.createdAt}-${index}`}><b>{label(event.toStatus??"Updated")}</b> · {event.reason}<small>{event.actor?.email??"Authorized staff"} · {date(event.createdAt)}</small></li>)}</ol>:<p>Proposal created · {date(centre.createdAt)}</p>}</div>
      </div></details>)}</div> : <p className="sc-ops-empty">No centre proposals yet. An authorized AO can add the first proposal.</p>}
      <p className="sc-centre-gate">Planning estimates and proposals are not purchase authority. Rent, lease, purchase, renewal and opening actions stay pending until an authorized approver records a decision.</p>
    </>}
  </section>;
}
