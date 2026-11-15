"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, UserPlus, X } from "lucide-react";
import { hrAction, type HrState } from "./hr-actions";

type Company = { organizationId: string; legalName: string | null; displayName: string; slug: string };
type Brand = { id: string; name: string; organizationId: string; parentName: string | null; slug: string };
const initial: HrState = {};

function positions(companySlug: string, brandSlug?: string) {
  if (brandSlug === "nice-jobs") return ["NICEJOBS Director"];
  if (brandSlug === "aira-labs") return ["Director", "Full Stack Developer"];
  if (brandSlug === "startup-school") return ["Director"];
  if (brandSlug === "aira-media-company") return ["Digital Marketing Manager", "Graphic Designer", "Video and Audio Editor", "AI Video Expert"];
  if (companySlug === "aira-skill-city" && (!brandSlug || brandSlug === "aira-skill-city")) return ["Administrative Officer"];
  return [];
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
  const [formError, setFormError] = useState("");
  const title = position;

  if (state.employmentId) return <section className="boss-hr-hire-result" role="status" aria-live="polite">
    <span className="eyebrow">EMPLOYEE APPOINTMENT</span>
    <h3>{state.inviteSent ? "Setup invitation sent" : "Appointment saved"}</h3>
    <p>{state.message}</p>
    {state.activationUrl && <p><a className="button" href={`https://wa.me/?text=${encodeURIComponent(`Please complete your secure AIRA employee account setup: ${state.activationUrl}. The verification code was emailed to your work address.`)}`} target="_blank" rel="noreferrer">Share setup link on WhatsApp</a></p>}
    <div className="boss-hr-hire-actions"><Link className="button" href={`/app/boss/departments/hr/employees/${encodeURIComponent(state.employmentId)}`}>Open employee record <ArrowRight size={16}/></Link><button type="button" className="button secondary" onClick={() => onOpenProfile("")}>Close</button></div>
    {state.error && <p role="alert">{state.error}</p>}
  </section>;

  function continueToDetails() {
    if (!companyId) { setFormError("Choose a company first."); return; }
    if (!position || !title) { setFormError("Choose a prepared position."); return; }
    setFormError(""); setStep(1);
  }

  function validateDetails(event: React.FormEvent<HTMLFormElement>) {
    if (step === 0) { event.preventDefault(); continueToDetails(); return; }
    const data = new FormData(event.currentTarget);
    const name = String(data.get("displayName") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const joiningDate = String(data.get("joiningDate") ?? "").trim();
    if (!name || !email || !phone || !joiningDate) { event.preventDefault(); setFormError("Add the employee’s name, work email, mobile number and joining date."); return; }
    setFormError("");
  }

  return <form action={action} className="boss-hr-hire-form" onSubmit={validateDetails}>
    <input type="hidden" name="intent" value="appoint"/>
    <input type="hidden" name="companyId" value={companyId}/>
    <input type="hidden" name="designation" value={title}/>
    {brandId && <input type="hidden" name="brandId" value={brandId}/> }
    <input type="hidden" name="contactEmail" value=""/>
    <input type="hidden" name="contactPhone" value=""/>
    {brandId && <input type="hidden" name="assignmentDecisionReference" value="Boss HR appointment"/>}
    {brandId && <input type="hidden" name="initialBrandIds" value={brandId}/>}
    <header className="boss-hr-hire-step-heading"><span>STEP {step + 1} OF 2</span><h3>{step === 0 ? "Choose the role" : "Employee details"}</h3><p>{step === 0 ? "Select the legal company, work area and job title." : "Enter the details for the employee record."}</p></header>

    {step === 0 ? <div className="boss-hr-hire-fields">
      <label>Company<select value={companyId} onChange={event => { setCompanyId(event.target.value); setBrandId(""); setPosition(""); }} required><option value="">Choose a company</option>{companies.map(item => <option key={item.organizationId} value={item.organizationId}>{item.legalName ?? item.displayName}</option>)}</select></label>
      <label>Brand or work area<select value={brandId} onChange={event => { setBrandId(event.target.value); setPosition(""); }}><option value="">Company-wide / no brand assignment</option>{availableBrands.map(item => <option key={item.id} value={item.id}>{item.parentName ? `${item.parentName} / ` : ""}{item.name}</option>)}</select></label>
      <label>Position<select value={position} onChange={event => setPosition(event.target.value)} required><option value="">Choose a position</option>{titleOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
      {!titleOptions.length && <p className="boss-hr-hire-note">No prepared dashboard role is available for this work area yet.</p>}
      <p className="boss-hr-hire-note">After appointment, the employee receives a secure setup invitation by email. Access activates only after their required verification is complete.</p>
    </div> : <div className="boss-hr-hire-fields">
      <div className="boss-hr-hire-summary"><strong>{company?.legalName ?? company?.displayName}</strong><span>{selectedBrand?.name ?? "Company-wide"} · {title}</span><button type="button" onClick={() => { setFormError(""); setStep(0); }}>Change</button></div>
      <div className="boss-hr-hire-grid">
        <label>Full name<input name="displayName" autoComplete="name" maxLength={200} required/></label>
        <label>Work email<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
        <label>Mobile number<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" maxLength={24} required/></label>
        <label>Joining date<input name="joiningDate" type="date" required/></label>
      </div>
      <p className="boss-hr-hire-note">This appoints the employee and prepares access for the selected workspace. They will verify their email, set their own sign-in credential and complete their profile after signing in.</p>
    </div>}

    {(formError || state.error) && <p role="alert" className="boss-hr-hire-error">{formError || state.error}</p>}
    <footer className="boss-hr-hire-actions">
      {step === 1 && <button type="button" className="button secondary" onClick={() => { setFormError(""); setStep(0); }}>Back</button>}
      {step === 0 ? <button type="button" className="button" onClick={continueToDetails}>Continue <ArrowRight size={16}/></button> : <button className="button" disabled={pending}>{pending ? "Preparing appointment…" : "Appoint and send setup"}</button>}
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
