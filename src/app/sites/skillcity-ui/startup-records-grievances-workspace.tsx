"use client";
import { useMemo, useState, useActionState } from "react";
import type { createStartupRecordsGrievancesDesk } from "@/server/skillcity/startup-records-grievances-desk";
import { startupOpsAction, type StartupOpsActionState } from "./startup-operations-actions";

type Data = Awaited<ReturnType<ReturnType<typeof createStartupRecordsGrievancesDesk>["workspace"]>>;
const empty: StartupOpsActionState = {};
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
const date = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not scheduled";
function Status({ state }: { state: StartupOpsActionState }) { return state.error ? <p className="sc-ops-error" role="alert">{state.error}</p> : state.message ? <p className="sc-ops-success" role="status">{state.message}</p> : null; }

function RecordUpload({ data }: { data: Data }) {
  const [state, action, pending] = useActionState(startupOpsAction, empty);
  const [kind, setKind] = useState("CENTRE");
  if (!data.canManageRecords) return null;
  const targets = kind === "CENTRE" ? data.documentTargets.centres : kind === "PROGRAMME" ? data.documentTargets.programmes : kind === "EMPLOYEE" ? data.documentTargets.employees : kind === "ADMISSIONS" ? data.documentTargets.admissions : [];
  const requiredSensitive = kind === "EMPLOYEE" || kind === "ADMISSIONS";
  return <details className="sc-centre-proposal"><summary>Add document to the records register</summary><form action={action} className="sc-ops-form" encType="multipart/form-data"><input type="hidden" name="action" value="RECORD_UPLOAD"/>
    <label>Record area<select name="documentType" value={kind} onChange={event=>setKind(event.target.value)}>{data.canManageSensitiveRecords&&<><option value="CENTRE">Centre</option><option value="PROGRAMME">Programme</option><option value="EMPLOYEE">Employee · restricted</option><option value="ADMISSIONS">Admissions · restricted</option></>}<option value="VENDOR">Vendor</option></select></label>
    <label>Document category<input name="category" required minLength={2} maxLength={80} placeholder="Lease, safety, programme guide, invoice…"/></label>
    <label className="sc-ops-wide">Document title<input name="title" required minLength={2} maxLength={160}/></label>
    <label>Related record<select name="entityReference" required={kind!=="VENDOR"} disabled={kind==="VENDOR"} defaultValue=""><option value="">Choose linked record</option>{targets.map(target=><option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
    {kind==="VENDOR"&&<label>Vendor name / reference<input name="entityReference" required minLength={2} maxLength={160}/></label>}
    <label>Entity display name<input name="entityLabel" required minLength={2} maxLength={160} placeholder={kind==="VENDOR"?"Vendor name":"Name shown in register"}/></label>
    <label>Search tags (optional)<input name="tags" maxLength={400} placeholder="Agreement, district, year"/></label>
    {requiredSensitive&&<label className="sc-record-sensitive"><input name="sensitive" type="checkbox" defaultChecked/> Restricted document; only specifically authorized reviewers can open it</label>}
    <label className="sc-ops-wide">Upload PDF or image (up to 20 MB)<input name="recordFile" type="file" required accept="application/pdf,image/png,image/jpeg,image/webp"/></label>
    <p className="sc-ops-wide sc-centre-gate">Employee and admissions files are always restricted. This register stores a private copy and does not replace the source employee or application record.</p>
    <div className="sc-ops-wide"><button disabled={pending}>{pending?"Saving document…":"Add to searchable register"}</button><Status state={state}/></div>
  </form></details>;
}

function GrievanceSubmit({ data }: { data: Data }) {
  const [state, action, pending] = useActionState(startupOpsAction, empty);
  if (!data.canSubmitGrievance) return null;
  return <details className="sc-centre-proposal"><summary>Report a grievance</summary><form action={action} className="sc-ops-form"><input type="hidden" name="action" value="GRIEVANCE_SUBMIT"/>
    <label>Category<select name="category"><option value="ADMISSIONS">Admissions</option><option value="CENTRE_FACILITY">Centre / facilities</option><option value="STAFF_CONDUCT">Staff conduct</option><option value="SAFETY">Safety</option><option value="FINANCE">Finance</option><option value="VENDOR">Vendor</option><option value="OTHER">Other</option></select></label>
    <label>Severity<select name="severity"><option value="NORMAL">Normal</option><option value="LOW">Low</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
    <label>State<input name="state" maxLength={100}/></label><label>District<input name="district" maxLength={100}/></label><label>Centre (if relevant)<input name="centre" maxLength={160}/></label>
    <label className="sc-ops-wide">Short title<input name="title" required minLength={4} maxLength={160}/></label>
    <label className="sc-ops-wide">What happened? Include only details needed to review the issue.<textarea name="details" required minLength={12} maxLength={5000} rows={4}/></label>
    <label className="sc-record-sensitive"><input name="sensitive" type="checkbox"/> Sensitive case: restrict its details to specifically authorized reviewers</label>
    <div className="sc-ops-wide"><button disabled={pending}>{pending?"Submitting…":"Submit grievance"}</button><Status state={state}/></div>
  </form></details>;
}

function CaseActionForm({ data, grievance, actionType, status }: { data: Data; grievance: Data["grievances"][number]; actionType: string; status?: string }) {
  const [state, action, pending] = useActionState(startupOpsAction, empty);
  return <form action={action} className="sc-centre-mini-form"><input type="hidden" name="action" value="GRIEVANCE_UPDATE"/><input type="hidden" name="id" value={grievance.id}/><input type="hidden" name="version" value={grievance.version}/><input type="hidden" name="grievanceAction" value={actionType}/>
    {actionType==="ASSIGN"&&<><label>Assign owner<select name="assignedUserId" required defaultValue={grievance.assignedUserId}><option value="">Select owner</option>{data.owners.map(owner=><option key={owner.userId} value={owner.userId}>{owner.name}{owner.email?` · ${owner.email}`:""}</option>)}</select></label><label>Due date and time<input name="dueAt" type="datetime-local" defaultValue={grievance.dueAt?new Date(grievance.dueAt).toISOString().slice(0,16):""}/></label></>}
    {status&&<label>Next status<select name="status" defaultValue={status}>{["OPEN","IN_REVIEW","ACTION_REQUIRED"].map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>}
    {actionType==="ADD_ACTION"&&<label className="sc-centre-wide">Action taken<textarea name="note" required minLength={8} maxLength={1200}/></label>}
    {actionType==="UPDATE"&&<label className="sc-centre-wide">Reason / action note<textarea name="note" required minLength={8} maxLength={1200}/></label>}
    {actionType==="RESOLVE"&&<label className="sc-centre-wide">Resolution<textarea name="resolution" required minLength={12} maxLength={2400}/></label>}
    {actionType==="ESCALATE"&&<label className="sc-centre-wide">Escalation note<input name="note" minLength={0} maxLength={500} placeholder="Serious or overdue case; routed to leadership"/></label>}
    <button disabled={pending}>{pending?"Saving…":actionType==="ESCALATE"?"Escalate to leadership":"Save case update"}</button><Status state={state}/>
  </form>;
}

export function StartupRecordsGrievancesWorkspace({ data, base }: { data: Data; base: string }) {
  const [search, setSearch] = useState(""); const [docType, setDocType] = useState("");
  const documents = useMemo(()=>data.documents.filter(document=>(!docType||document.documentType===docType)&&(!search||[document.title,document.documentType,document.category,document.entityLabel,document.entityReference,document.tags].some(value=>value.toLowerCase().includes(search.toLowerCase())))),[data.documents,docType,search]);
  return <div className="sc-governance-stack">
    <section className="sc-section sc-centres" id="startup-records"><div className="sc-startup-ops-top"><div><p className="sc-centre-eyebrow">SEARCHABLE · PRIVATE · AUDITED</p><h2>Documents &amp; records</h2><p>Centre, programme, employee, vendor and admissions documents in one searchable Startup Skool register.</p></div><span>{data.counts.documentCount} records</span></div>
      <RecordUpload data={data}/>
      {data.canReadRecords?<><div className="sc-record-filters"><label>Search records<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Title, centre, employee, vendor, application…"/></label><label>Area<select value={docType} onChange={event=>setDocType(event.target.value)}><option value="">All areas</option>{["CENTRE","PROGRAMME","EMPLOYEE","VENDOR","ADMISSIONS","RESTRICTED"].map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label></div>
        {documents.length?<div className="sc-ops-list">{documents.map(document=><article className="sc-ops-task" key={document.id}><b>{document.title}</b><span>{label(document.documentType)} · {document.category} · {document.entityLabel} · {document.entityReference}</span><small>Added {date(document.createdAt)}{document.sensitive?" · Restricted":""}</small>{document.files.map(file=><a key={file.id} href={`${base.startsWith("/sites/")?"/sites/skillcity":""}/operations-files/${encodeURIComponent(file.id)}?${document.sourceKind==="CENTRE"?`centreId=${encodeURIComponent(document.sourceRecordId)}`:`recordId=${encodeURIComponent(document.sourceRecordId)}`}`} target="_blank" rel="noreferrer">Open {file.filename} · {(file.bytes/1024).toFixed(0)} KB</a>)}</article>)}</div>:<p className="sc-ops-empty">No documents match this search. Centre proposal files also appear here automatically.</p>}
      </>:<p className="sc-ops-empty">You do not have permission to browse the records register.</p>}
      <p className="sc-centre-gate">Restricted employee and admissions document contents are hidden unless the user has the specific sensitive-record permission. This is not a copy of an employee’s original HR profile file.</p>
    </section>
    <section className="sc-section sc-centres"><div className="sc-startup-ops-top"><div><p className="sc-centre-eyebrow">PRIVATE CASE MANAGEMENT</p><h2>Grievances</h2><p>Receive, assign, act, resolve and escalate cases. Sensitive case details stay restricted.</p></div><span>{data.counts.openGrievances} open</span></div>
      <div className="sc-startup-ops-cards"><article><strong>{data.counts.grievanceCount}</strong><span>Cases in view</span></article><article className={data.counts.overdueGrievances?"sc-ops-alert":""}><strong>{data.counts.overdueGrievances}</strong><span>Overdue</span></article><article className={data.counts.escalationRequired?"sc-ops-alert":""}><strong>{data.counts.escalationRequired}</strong><span>Escalation required</span></article></div>
      <GrievanceSubmit data={data}/>
      {!data.canReadGrievances?<p className="sc-ops-empty">You can submit a grievance, but cannot browse case files.</p>:data.grievances.length?<div className="sc-ops-list">{data.grievances.map(grievance=><details className="sc-ops-item" key={grievance.id}><summary><span><b>{grievance.reference} · {grievance.title}</b><small>{label(grievance.category)} · {label(grievance.severity)}{grievance.sensitive?" · Restricted details":""}</small></span><span className="sc-ops-summary-status">{label(grievance.status)}<small>{grievance.assignedName} · Due {date(grievance.dueAt)}</small></span></summary><div className="sc-ops-detail">{grievance.details&&<p>{grievance.details}</p>}{grievance.overdue&&<p className="sc-ops-error">Overdue · leadership escalation should be reviewed.</p>}{grievance.escalationRequired&&grievance.status!=="ESCALATED"&&<p className="sc-ops-error">Serious or overdue · escalation required.</p>}{grievance.resolution&&<div><b>Resolution</b><p>{grievance.resolution}</p></div>}
        {grievance.actions.length>0&&<div><b>Actions</b><ol className="sc-ops-history">{grievance.actions.map((entry,index)=><li key={`${entry.createdAt}-${index}`}><b>{label(entry.type)}</b> · {entry.note}<small>{entry.actor} · {date(entry.createdAt)}</small></li>)}</ol></div>}
        {grievance.history.length>0&&<div><b>Case history</b><ol className="sc-ops-history">{grievance.history.map((entry,index)=><li key={`${entry.createdAt}-${index}`}><b>{label(entry.toStatus)}</b> · {entry.reason}<small>{entry.actor?.email??"Authorized staff"} · {date(entry.createdAt)}</small></li>)}</ol></div>}
        {data.canManageGrievances&&<><h4>AO coordination</h4><CaseActionForm data={data} grievance={grievance} actionType="ASSIGN"/><div className="sc-centre-action-grid">{grievance.sensitive&&!data.canReadSensitiveGrievances?<CaseActionForm data={data} grievance={grievance} actionType="ESCALATE"/>:<><CaseActionForm data={data} grievance={grievance} actionType="UPDATE" status="IN_REVIEW"/><CaseActionForm data={data} grievance={grievance} actionType="ADD_ACTION"/><CaseActionForm data={data} grievance={grievance} actionType="RESOLVE"/></>}{grievance.escalationRequired&&grievance.status!=="ESCALATED"&&<CaseActionForm data={data} grievance={grievance} actionType="ESCALATE"/>}</div></>}
      </div></details>)}</div>:<p className="sc-ops-empty">No grievance cases are visible here.</p>}
      <p className="sc-centre-gate">AO users can coordinate assignments, due dates and leadership escalation for restricted cases without seeing their title, narrative, action notes or resolution. Only authorized sensitive-case reviewers can access those details.</p>
    </section>
  </div>;
}
