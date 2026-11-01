"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { hrAction, type HrState } from "./hr-actions";

type Brand = { id: string; name: string; parentName: string | null; status: string };
type Person = { id: string; displayName: string; email: string | null };
const steps = ["Person", "Employment", "Assignments", "Access"] as const;
const initial: HrState = {};

export function HrOnboarding({ companyId, companyName, brands, people, departments, managers }: { companyId: string; companyName: string; brands: Brand[]; people: Person[]; departments: { id: string; name: string }[]; managers: { personId: string; name: string }[] }) {
  const [step, setStep] = useState(0);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [state, action, pending] = useActionState(hrAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const next = () => {
    const data = new FormData(formRef.current!);
    if (step === 0 && !selectedPerson && (!String(data.get("displayName") || "").trim() || !String(data.get("email") || "").trim())) { setFormError("Enter a name and email, or choose an existing person."); return; }
    if (step === 1 && !String(data.get("designation") || "").trim()) { setFormError("Enter the designation from the approved employment arrangement."); return; }
    if (step === 2 && selectedBrands.length && (!data.get("joiningDate") || String(data.get("assignmentDecisionReference") || "").trim().length < 8)) { setFormError("Brand assignments need a joining date and an approval reference of at least eight characters."); return; }
    setFormError(""); setStep(step + 1);
  };
  if (state.employmentId) return <section className="executive-band boss-hr-onboarding-result" role="status"><h2>Employee draft saved</h2><p>{state.message}</p><p>Review employment and assignments, then arrange authorized account access separately.</p><Link className="button" href={`/app/boss/departments/hr/employees/${encodeURIComponent(state.employmentId)}`}>Open employee profile</Link></section>;
  return <section className="executive-band boss-hr-onboarding" aria-label="Add employee"><header><p className="eyebrow">NEW EMPLOYEE</p><h2>Add employee</h2><p>Four short steps. Saving creates an HR draft; it does not activate a login.</p></header>
    <ol className="boss-hr-steps" aria-label="Onboarding steps">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <form ref={formRef} action={action} onSubmit={event => { if (step < 3) { event.preventDefault(); next(); } }} className="boss-hr-wizard-form"><input type="hidden" name="intent" value="create"/><input type="hidden" name="companyId" value={companyId}/>
      <div hidden={step !== 0}><h3>Who is joining?</h3><p>Search the existing people list before creating another record.</p><label>Find a person <input type="search" value={personSearch} onChange={event => setPersonSearch(event.target.value)} placeholder="Name or email"/></label><label>Existing person <select name="personId" value={selectedPerson} onChange={event => setSelectedPerson(event.target.value)}><option value="">Create a new person</option>{people.filter(person => !personSearch || `${person.displayName} ${person.email ?? ""}`.toLowerCase().includes(personSearch.toLowerCase()) || person.id === selectedPerson).map(person => <option key={person.id} value={person.id}>{person.displayName}{person.email ? ` · ${person.email}` : ""}</option>)}</select></label>{!selectedPerson && <><label>Full name <input name="displayName" maxLength={200} autoComplete="name"/></label><label>Email <input name="email" type="email" maxLength={254} autoComplete="email"/></label><label className="boss-hr-inline-check"><input type="checkbox" name="linkExisting"/> Link to the person already using this exact email</label></>}</div>
      <div hidden={step !== 1}><h3>Employment</h3><p>Legal employer: <strong>{companyName}</strong></p><label>Designation <input name="designation" maxLength={120}/></label><label>Employment type from approved agreement <input name="employmentType" maxLength={80}/></label><label>Joining date <input name="joiningDate" type="date"/></label><p>Reporting manager is set on a verified brand assignment after the draft is saved.</p></div>
      <div hidden={step !== 2}><h3>Where will they work?</h3><p>Choose any applicable brands under {companyName}. These assignments remain drafts and do not grant access.</p><div className="boss-hr-brand-grid">{brands.filter(brand => brand.status === "ACTIVE").map(brand => <label key={brand.id} className="boss-hr-brand-choice"><input type="checkbox" name="initialBrandIds" value={brand.id} checked={selectedBrands.includes(brand.id)} onChange={event => setSelectedBrands(current => event.target.checked ? [...current, brand.id] : current.filter(id => id !== brand.id))}/><span>{brand.parentName ? `${brand.parentName} / ` : ""}{brand.name}</span></label>)}</div>{!brands.some(brand => brand.status === "ACTIVE") && <p>No active brand is available in this company. Save the company employment draft first.</p>}{selectedBrands.length > 0 && <><label>Department <select name="initialDepartmentId"><option value="">Not assigned</option>{departments.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Reporting manager <select name="initialManagerPersonId"><option value="">Assign later</option>{managers.filter(row => row.personId !== selectedPerson).map(row => <option key={row.personId} value={row.personId}>{row.name}</option>)}</select></label><p>The manager must have verified access and an active assignment to every selected brand.</p><label>Assignment approval reference <input name="assignmentDecisionReference" minLength={8} maxLength={200} placeholder="Recorded decision or approval reference"/></label></>}</div>
      <div hidden={step !== 3}><h3>Review access boundary</h3><p><strong>Company:</strong> {companyName}</p><p><strong>Brand drafts:</strong> {selectedBrands.length ? brands.filter(brand => selectedBrands.includes(brand.id)).map(brand => brand.name).join(", ") : "None yet"}</p><p><strong>Login identity:</strong> The employee email, after account verification.</p><p><strong>Role and portal:</strong> Pending authorized selection and configuration in the employee Access tab.</p><p className="boss-hr-access-warning">This step saves employment and assignment drafts only. No invitation is sent and no login permission is granted.</p></div>
      {(formError || state.error) && <p role="alert">{formError || state.error}</p>}
      <footer className="boss-hr-wizard-actions">{step > 0 && <button type="button" className="button secondary" onClick={() => { setFormError(""); setStep(step - 1); }}>Back</button>}{step < 3 ? <button type="button" className="button" onClick={next}>Continue</button> : <button className="button" disabled={pending}>{pending ? "Saving…" : "Save employee draft"}</button>}</footer>
    </form>
  </section>;
}
