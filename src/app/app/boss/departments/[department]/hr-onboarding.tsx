"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, UserPlus, X } from "lucide-react";
import { hrAction, type HrState } from "./hr-actions";

type Company = { organizationId: string; legalName: string | null; displayName: string; slug: string };
type Brand = { id: string; name: string; organizationId: string; parentName: string | null; slug: string };
export type ReportingChoice = { userId: string; name: string; title: string; email: string; brandId: string | null };
const initial: HrState = {};

function positions(companySlug: string, brandSlug?: string) {
  if (brandSlug === "aira-labs") return ["Director", "Full Stack Developer"];
  if (brandSlug === "startup-school") return ["Director", "Administrative Officer"];
  if (brandSlug === "aira-media-company") return ["Digital Marketing Manager", "Graphic Designer", "Video and Audio Editor", "AI Video Expert"];
  if (companySlug === "aira-skill-city" && !brandSlug) return ["Administrative Officer"];
  return [];
}

function HireEmployeeForm({ companies, brands, reportingChoices, initialCompanyId, onClose }: { companies: Company[]; brands: Brand[]; reportingChoices: ReportingChoice[]; initialCompanyId?: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(hrAction, initial);
  const [companyId, setCompanyId] = useState(initialCompanyId && companies.some(company => company.organizationId === initialCompanyId) ? initialCompanyId : companies[0]?.organizationId ?? "");
  const [brandId, setBrandId] = useState("");
  const [position, setPosition] = useState("");
  const [formError, setFormError] = useState("");
  const [slowRequest, setSlowRequest] = useState(false);
  const company = companies.find(item => item.organizationId === companyId);
  const availableBrands = brands.filter(item => item.organizationId === companyId && item.slug !== "aira-skill-city");
  const selectedBrand = availableBrands.find(item => item.id === brandId);
  const positionOptions = positions(company?.slug ?? "", selectedBrand?.slug);
  const directorAppointment = position === "Director";
  const startupAoAppointment = selectedBrand?.slug === "startup-school" && position === "Administrative Officer";
  const reporters = reportingChoices.filter(choice =>
    (choice.brandId === brandId || !brandId && choice.brandId === null) &&
    (!startupAoAppointment || /\bdirector\b/i.test(choice.title))
  );
  const requiresReporter = position !== "" && !directorAppointment;

  useEffect(() => {
    if (!pending) { setSlowRequest(false); return; }
    const timer = window.setTimeout(() => setSlowRequest(true), 15000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (state.employmentId) {
    const message = state.shareMessage ?? "";
    const email = state.shareEmail ?? "";
    return <section className="boss-hr-hire-result" role="status" aria-live="polite">
      <span className="eyebrow">EMPLOYEE APPOINTMENT</span>
      <h3>{state.dashboardReady ? "Employee added. Dashboard connected." : state.inviteSent ? "Employee added. Setup email sent." : "Employee record saved."}</h3>
      <p>{state.message}</p>
      {state.error && <p role="alert">{state.error}</p>}
      {state.activationUrl && <>
        <label className="boss-hr-share-message">Message to share<textarea readOnly rows={4} value={message}/></label>
        <div className="boss-hr-share-actions">
          <a className="button" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          <a className="button secondary" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Your AIRA employee account setup")}&body=${encodeURIComponent(message)}`}>Share by email</a>
          <button type="button" className="button secondary" onClick={() => navigator.clipboard?.writeText(message)}>Copy message</button>
        </div>
        <p className="boss-hr-hire-note">The verification code is sent to the employee’s work email. Do not forward the code.</p>
      </>}
      <div className="boss-hr-hire-actions"><button type="button" className="button" onClick={onClose}>Done</button></div>
    </section>;
  }

  function validate(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const required = [companyId, position, String(data.get("displayName") ?? "").trim(), String(data.get("email") ?? "").trim(), String(data.get("phone") ?? "").trim(), String(data.get("joiningDate") ?? "")];
    if (required.some(value => !value)) { event.preventDefault(); setFormError("Choose the company, team and role, then complete the four employee details."); return; }
    if (requiresReporter && !String(data.get("reportToUserId") ?? "")) { event.preventDefault(); setFormError("Choose who this employee reports to."); return; }
    if (requiresReporter && !reporters.some(person => person.userId === String(data.get("reportToUserId")))) { event.preventDefault(); setFormError("Choose an available reporting person for this team."); return; }
    setFormError("");
  }

  return <form action={action} className="boss-hr-hire-form" onSubmit={validate}>
    <input type="hidden" name="intent" value="appoint"/>
    <input type="hidden" name="companyId" value={companyId}/>
    <input type="hidden" name="designation" value={position}/>
    {brandId && <input type="hidden" name="brandId" value={brandId}/>}
    {brandId && <input type="hidden" name="initialBrandIds" value={brandId}/>}
    {brandId && <input type="hidden" name="assignmentDecisionReference" value="Boss HR appointment"/>}
    <header className="boss-hr-hire-step-heading"><span>ONE SIMPLE FORM</span><h3>Employee details</h3><p>Choose their team and role, then enter their basic details.</p></header>
    <div className="boss-hr-hire-fields">
      <div className="boss-hr-hire-grid">
        <label>Company<select value={companyId} onChange={event => { setCompanyId(event.target.value); setBrandId(""); setPosition(""); }} required><option value="">Choose a company</option>{companies.map(item => <option key={item.organizationId} value={item.organizationId}>{item.legalName ?? item.displayName}</option>)}</select></label>
        <label>Team / work area<select value={brandId} onChange={event => { setBrandId(event.target.value); setPosition(""); }}><option value="">Company-wide</option>{availableBrands.map(item => <option key={item.id} value={item.id}>{item.parentName ? `${item.parentName} / ` : ""}{item.slug === "startup-school" ? "Startup Skool" : item.name}</option>)}</select></label>
        <label>Role<select value={position} onChange={event => setPosition(event.target.value)} required><option value="">Choose a role</option>{positionOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
        {requiresReporter && <label>Reports to<select name="reportToUserId" required defaultValue=""><option value="">{startupAoAppointment ? "Choose Startup Skool Director" : "Choose a reporting person"}</option>{reporters.map(person => <option key={person.userId} value={person.userId}>{person.name} · {person.title}</option>)}</select></label>}
        {directorAppointment && <p className="boss-hr-hire-note" role="status">Reports directly to the MAXPASE Boss.</p>}
        <label>Full name<input name="displayName" autoComplete="name" maxLength={200} required/></label>
        <label>Work email<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
        <label>Mobile number<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" maxLength={24} required/></label>
        <label>Joining date<input name="joiningDate" type="date" required/></label>
      </div>
      {!positionOptions.length && <p className="boss-hr-hire-note">No approved dashboard position is configured for this work area.</p>}
      {requiresReporter && !reporters.length && <p className="boss-hr-hire-note">{startupAoAppointment ? "No active, verified Startup Skool Director is available. Add and activate the Director first, then appoint the AO." : "No active, verified reporting person is available for this team. Activate a Director or Manager first."}</p>}
      <p className="boss-hr-hire-note">Submitting creates the employee record, assigns the role-based workspace and emails secure setup instructions. The employee verifies their email and sets their own password or PIN.</p>
    </div>
    {(formError || state.error) && <p role="alert" className="boss-hr-hire-error">{formError || state.error}</p>}
    {pending && slowRequest && <p role="status" className="boss-hr-hire-note">Still working. Do not submit again; check the employee directory before retrying.</p>}
    <footer className="boss-hr-hire-actions"><button className="button" disabled={pending || !positionOptions.length || (requiresReporter && !reporters.length)}>{pending ? slowRequest ? "Still adding employee…" : "Adding employee…" : "Add employee and share setup"} <ArrowRight size={16}/></button></footer>
  </form>;
}

export function HrOnboarding({ companies, brands, reportingChoices, initialCompanyId }: { companies: Company[]; brands: Brand[]; reportingChoices: ReportingChoice[]; initialCompanyId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  function close() { dialog.current?.close(); }
  return <>
    <button type="button" className="boss-hr-action-primary" onClick={() => dialog.current?.showModal()}><UserPlus/><strong>Add team member</strong><small>Choose their team and role, then add basic details</small><ArrowRight/></button>
    <dialog ref={dialog} className="boss-hr-hire-dialog" aria-labelledby="boss-hr-hire-title" onClose={() => setFormKey(key => key + 1)}>
      <header className="boss-hr-hire-dialog-header"><div><p className="eyebrow">BOSS DASHBOARD / PEOPLE</p><h2 id="boss-hr-hire-title">Add team member</h2></div><button type="button" aria-label="Close" onClick={close}><X size={20}/></button></header>
      <HireEmployeeForm key={formKey} companies={companies} brands={brands} reportingChoices={reportingChoices} initialCompanyId={initialCompanyId} onClose={close}/>
    </dialog>
  </>;
}
