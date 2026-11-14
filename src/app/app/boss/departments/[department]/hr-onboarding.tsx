"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, UserPlus, X } from "lucide-react";
import { hrAction, type HrState } from "./hr-actions";

type Company = { organizationId: string; legalName: string | null; displayName: string; slug: string };
type Brand = { id: string; name: string; organizationId: string; parentName: string | null; slug: string };
const initial: HrState = {};

function positions(companySlug: string, brandSlug?: string) {
  if (brandSlug === "nice-jobs") return ["NICEJOBS Director", "Career Hub Operations", "Community Manager", "Other"];
  if (brandSlug === "aira-labs") return ["Full Stack Developer", "Software Developer", "Project Manager", "Other"];
  if (companySlug === "aira-skill-city" && !brandSlug) return ["Administrative Officer", "HR Manager", "Office Administrator", "Other"];
  return ["Team Member", "Brand Manager", "Operations Associate", "Other"];
}

function HireEmployeeForm({ companies, brands, initialCompanyId, onOpenProfile }: { companies: Company[]; brands: Brand[]; initialCompanyId?: string; onOpenProfile: (id: string) => void }) {
  const [state, action, pending] = useActionState(hrAction, initial);
  const [step, setStep] = useState(0);
  const [companyId, setCompanyId] = useState(initialCompanyId && companies.some(company => company.organizationId === initialCompanyId) ? initialCompanyId : companies[0]?.organizationId ?? "");
  const [brandId, setBrandId] = useState("");
  const company = companies.find(item => item.organizationId === companyId);
  const availableBrands = brands.filter(item => item.organizationId === companyId);
  const selectedBrand = availableBrands.find(item => item.id === brandId);
  const titleOptions = positions(company?.slug ?? "", selectedBrand?.slug);
  const [position, setPosition] = useState("");
  const [customPosition, setCustomPosition] = useState("");
  const [formError, setFormError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const title = position === "Other" ? customPosition.trim() : position;

  if (state.employmentId) return <section className="boss-hr-hire-result" role="status" aria-live="polite">
    <span className="eyebrow">EMPLOYEE RECORD CREATED</span>
    <h3>Saved as an employment draft</h3>
    <p>{state.message}</p>
    <p>Next, review the employment record and complete its account access. No login was activated and no PIN was generated or shared.</p>
    <div className="boss-hr-hire-actions"><Link className="button" href={`/app/boss/departments/hr/employees/${encodeURIComponent(state.employmentId)}`}>Open employee record <ArrowRight size={16}/></Link><button type="button" className="button secondary" onClick={() => onOpenProfile("")}>Close</button></div>
    {state.error && <p role="alert">{state.error}</p>}
  </section>;

  function continueToDetails() {
    if (!companyId) { setFormError("Choose a company first."); return; }
    if (!position || !title) { setFormError("Choose a position or enter a job title."); return; }
    setFormError(""); setStep(1);
  }

  function validateDetails(event: React.FormEvent<HTMLFormElement>) {
    if (step === 0) { event.preventDefault(); continueToDetails(); return; }
    const data = new FormData(event.currentTarget);
    const name = String(data.get("displayName") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const joiningDate = String(data.get("joiningDate") ?? "").trim();
    const employmentType = String(data.get("employmentType") ?? "").trim();
    if (!name || !email || !phone || !joiningDate || !employmentType) { event.preventDefault(); setFormError("Add the employee’s name, email, mobile number, joining date and employment type."); return; }
    if (brandId && String(data.get("assignmentDecisionReference") ?? "").trim().length < 8) { event.preventDefault(); setFormError("Add the recorded brand assignment decision reference."); return; }
    setFormError("");
  }

  return <form ref={formRef} action={action} className="boss-hr-hire-form" onSubmit={validateDetails}>
    <input type="hidden" name="intent" value="create"/>
    <input type="hidden" name="companyId" value={companyId}/>
    <input type="hidden" name="designation" value={title}/>
    <input type="hidden" name="contactEmail" value=""/>
    <input type="hidden" name="contactPhone" value=""/>
    {brandId && <input type="hidden" name="assignmentDecisionReference" value="HR-authorized hire entry"/>}
    {brandId && <input type="hidden" name="initialBrandIds" value={brandId}/>}
    <header className="boss-hr-hire-step-heading"><span>STEP {step + 1} OF 2</span><h3>{step === 0 ? "Choose the role" : "Employee details"}</h3><p>{step === 0 ? "Select the legal company, work area and job title." : "Enter the details for the employee record."}</p></header>

    {step === 0 ? <div className="boss-hr-hire-fields">
      <label>Company<select value={companyId} onChange={event => { setCompanyId(event.target.value); setBrandId(""); setPosition(""); setCustomPosition(""); }} required><option value="">Choose a company</option>{companies.map(item => <option key={item.organizationId} value={item.organizationId}>{item.legalName ?? item.displayName}</option>)}</select></label>
      <label>Brand or work area<select value={brandId} onChange={event => { setBrandId(event.target.value); setPosition(""); setCustomPosition(""); }}><option value="">Company-wide / no brand assignment</option>{availableBrands.map(item => <option key={item.id} value={item.id}>{item.parentName ? `${item.parentName} / ` : ""}{item.name}</option>)}</select></label>
      <label>Position<select value={position} onChange={event => setPosition(event.target.value)} required><option value="">Choose a position</option>{titleOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
      {position === "Other" && <label>Job title<input value={customPosition} onChange={event => setCustomPosition(event.target.value)} maxLength={120} placeholder="Enter the approved job title" required/></label>}
      <p className="boss-hr-hire-note">Job title records the work assignment. Portal access is reviewed separately and is never granted by the title alone.</p>
    </div> : <div className="boss-hr-hire-fields">
      <div className="boss-hr-hire-summary"><strong>{company?.legalName ?? company?.displayName}</strong><span>{selectedBrand?.name ?? "Company-wide"} · {title}</span><button type="button" onClick={() => { setFormError(""); setStep(0); }}>Change</button></div>
      <div className="boss-hr-hire-grid">
        <label>Full name<input name="displayName" autoComplete="name" maxLength={200}/></label>
        <label>Work email<input name="email" type="email" autoComplete="email" maxLength={254}/></label>
        <label>Mobile number<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="Include country code" maxLength={24}/></label>
        <label>Joining date<input name="joiningDate" type="date"/></label>
        <label>Employment type<select name="employmentType" defaultValue=""><option value="">Choose</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option><option>Other</option></select></label>
        <label>Emergency contact name<input name="emergencyContactName" maxLength={160}/></label>
        <label>Relationship<input name="emergencyContactRelationship" maxLength={80} placeholder="For example, parent or spouse"/></label>
        <label>Emergency contact mobile<input name="emergencyContactPhone" type="tel" inputMode="tel" maxLength={24}/></label>
        <label>Emergency contact email<input name="emergencyContactEmail" type="email" maxLength={254}/></label>
      </div>
      <label className="boss-hr-hire-link-existing"><input type="checkbox" name="linkExisting"/> Link the exact existing person record with this email, if this is the same person.</label>
      <p className="boss-hr-hire-note">The employee and brand assignment are saved as drafts. You will review employment and send an account activation invitation from the employee’s Access tab.</p>
    </div>}

    {(formError || state.error) && <p role="alert" className="boss-hr-hire-error">{formError || state.error}</p>}
    <footer className="boss-hr-hire-actions">
      {step === 1 && <button type="button" className="button secondary" onClick={() => { setFormError(""); setStep(0); }}>Back</button>}
      {step === 0 ? <button type="button" className="button" onClick={continueToDetails}>Continue <ArrowRight size={16}/></button> : <button className="button" disabled={pending}>{pending ? "Saving…" : "Create employee draft"}</button>}
    </footer>
  </form>;
}

export function HrOnboarding({ companies, brands, initialCompanyId }: { companies: Company[]; brands: Brand[]; initialCompanyId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  function open() { dialog.current?.showModal(); }
  function close() { dialog.current?.close(); }
  return <>
    <button type="button" className="boss-hr-action-primary" onClick={open}><UserPlus/><strong>Add team member</strong><small>Choose a company and position, then enter employee details</small><ArrowRight/></button>
    <dialog ref={dialog} className="boss-hr-hire-dialog" aria-labelledby="boss-hr-hire-title" onClose={() => setFormKey(key => key + 1)}>
      <header className="boss-hr-hire-dialog-header"><div><p className="eyebrow">BOSS DASHBOARD / PEOPLE</p><h2 id="boss-hr-hire-title">Add team member</h2></div><button type="button" aria-label="Close" onClick={close}><X size={20}/></button></header>
      <HireEmployeeForm key={formKey} companies={companies} brands={brands} initialCompanyId={initialCompanyId} onOpenProfile={close}/>
    </dialog>
  </>;
}
