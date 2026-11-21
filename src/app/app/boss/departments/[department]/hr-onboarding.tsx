"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, UserPlus, X } from "lucide-react";
import { hrAction, type HrState } from "./hr-actions";

type Company = { organizationId: string; legalName: string | null; displayName: string; slug: string };
type Brand = { id: string; name: string; organizationId: string; parentName: string | null; slug: string };
type RoleOption = { key: "brand-director" | "brand-administrative-officer" | "brand-specialist" | "brand-employee"; name: string };
type RoleCatalogue = { brandId: string; roles: RoleOption[] };
const initial: HrState = {};

function HireEmployeeForm({ companies, brands, roleCatalogues, initialCompanyId, onClose }: { companies: Company[]; brands: Brand[]; roleCatalogues: RoleCatalogue[]; initialCompanyId?: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(hrAction, initial);
  const [companyId, setCompanyId] = useState(initialCompanyId && companies.some(company => company.organizationId === initialCompanyId) ? initialCompanyId : companies[0]?.organizationId ?? "");
  const [brandId, setBrandId] = useState("");
  const [roleKey, setRoleKey] = useState<RoleOption["key"] | "">("");
  const [formError, setFormError] = useState("");
  const [slowRequest, setSlowRequest] = useState(false);
  const availableBrands = brands.filter(item => item.organizationId === companyId && item.slug !== "aira-skill-city");
  const selectedBrand = availableBrands.find(item => item.id === brandId);
  const roleOptions = selectedBrand ? roleCatalogues.find(catalogue => catalogue.brandId === selectedBrand.id)?.roles ?? [] : [];
  const role = roleOptions.find(item => item.key === roleKey);

  useEffect(() => {
    if (!pending) { setSlowRequest(false); return; }
    const timer = window.setTimeout(() => setSlowRequest(true), 15000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (state.employmentId) {
    const message = state.shareMessage ?? "";
    const email = state.shareEmail ?? "";
    return <section className="boss-hr-hire-result" role="status" aria-live="polite">
      <span className="eyebrow">EMPLOYEE ADDED</span>
      <h3>{state.dashboardReady ? "Employee added. Dashboard assigned." : "Employee record saved."}</h3>
      <dl className="boss-hr-hire-outcome"><div><dt>Employment</dt><dd>{state.dashboardReady ? "Active" : "Saved"}</dd></div><div><dt>Dashboard</dt><dd>{state.dashboardReady ? "Role assigned" : "Needs setup"}</dd></div><div><dt>Invitation</dt><dd>{state.inviteSent ? "Email sent" : state.activationUrl ? "Ready to share" : "Not sent"}</dd></div><div><dt>Sign-in</dt><dd>{state.inviteSent ? "Employee verifies email and sets their own credential" : "Available after secure invitation"}</dd></div></dl>
      <p>{state.message}</p>
      {state.error && <p role="alert">{state.error}</p>}
      {state.activationUrl && <>
        <label className="boss-hr-share-message">Message to share<textarea readOnly rows={4} value={message}/></label>
        <div className="boss-hr-share-actions">
          <a className="button" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          <a className="button secondary" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Your MAXPASE Group employee account setup")}&body=${encodeURIComponent(message)}`}>Share by email</a>
          <button type="button" className="button secondary" onClick={() => navigator.clipboard?.writeText(state.activationUrl ?? "")}>Copy invitation link</button>
          <button type="button" className="button secondary" onClick={() => navigator.clipboard?.writeText(message)}>Copy message</button>
        </div>
        <p className="boss-hr-hire-note">The verification code is sent to the employee’s work email. Do not forward the code. After setup and sign-in, their assigned dashboard opens automatically.</p>
      </>}
      {state.userId && state.brandId && !state.inviteSent && state.canRetryInvite && <form action={action} className="boss-hr-hire-actions"><input type="hidden" name="intent" value="resend-brand-invite"/><input type="hidden" name="userId" value={state.userId}/><input type="hidden" name="brandId" value={state.brandId}/><input type="hidden" name="employmentId" value={state.employmentId ?? ""}/><button className="button secondary" disabled={pending}>{pending ? "Sending…" : "Retry setup invitation"}</button></form>}
      <div className="boss-hr-hire-actions"><button type="button" className="button" onClick={onClose}>Done</button></div>
    </section>;
  }

  function validate(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const required = [companyId, brandId, roleKey, String(data.get("displayName") ?? "").trim(), String(data.get("email") ?? "").trim(), String(data.get("phone") ?? "").trim(), String(data.get("joiningDate") ?? "")];
    if (required.some(value => !value)) { event.preventDefault(); setFormError("Choose a company, brand and role, then complete the employee details."); return; }
    setFormError("");
  }

  return <form action={action} className="boss-hr-hire-form" onSubmit={validate}>
    <input type="hidden" name="intent" value="appoint"/>
    <input type="hidden" name="companyId" value={companyId}/>
    <input type="hidden" name="roleKey" value={roleKey}/>
    <input type="hidden" name="brandId" value={brandId}/>
    <header className="boss-hr-hire-step-heading"><span>ONE SIMPLE FORM</span><h3>Employee details</h3><p>Choose their team and role, then enter their basic details.</p></header>
    <div className="boss-hr-hire-fields">
      <div className="boss-hr-hire-grid">
        <label>Company<select value={companyId} onChange={event => { setCompanyId(event.target.value); setBrandId(""); setRoleKey(""); }} required><option value="">Choose a company</option>{companies.map(item => <option key={item.organizationId} value={item.organizationId}>{item.legalName ?? item.displayName}</option>)}</select></label>
        <label>Brand<select value={brandId} onChange={event => { setBrandId(event.target.value); setRoleKey(""); }} required><option value="">Choose a brand</option>{availableBrands.map(item => <option key={item.id} value={item.id}>{item.parentName ? `${item.parentName} / ` : ""}{item.slug === "startup-school" ? "Startup Skool" : item.name}</option>)}</select></label>
        <label>Role<select value={roleKey} onChange={event => setRoleKey(event.target.value as RoleOption["key"] | "")} required disabled={!selectedBrand}><option value="">{selectedBrand ? "Choose a role" : "Choose a brand first"}</option>{roleOptions.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}</select></label>
        {role && <p className="boss-hr-hire-note" role="status">Reports directly to the MAXPASE Boss by default. Dashboard access is assigned on submission.</p>}
        <label>Full name<input name="displayName" autoComplete="name" maxLength={200} required/></label>
        <label>Work email<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
        <label>Mobile number<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" maxLength={24} required/></label>
        <label>Joining date<input name="joiningDate" type="date" required/></label>
      </div>
      <p className="boss-hr-hire-note">Add Employee saves the company, brand, employment, role and dashboard together. Email setup is sent when delivery is configured; employees verify their email and set their own password.</p>
    </div>
    {(formError || state.error) && <p role="alert" className="boss-hr-hire-error">{formError || state.error}</p>}
    {pending && slowRequest && <p role="status" className="boss-hr-hire-note">Still working. Do not submit again; check the employee directory before retrying.</p>}
    <footer className="boss-hr-hire-actions"><button className="button" disabled={pending || !selectedBrand || !role}>{pending ? slowRequest ? "Still adding employee…" : "Adding employee…" : "Add Employee"} <ArrowRight size={16}/></button></footer>
  </form>;
}

export function HrOnboarding({ companies, brands, roleCatalogues, initialCompanyId }: { companies: Company[]; brands: Brand[]; roleCatalogues: RoleCatalogue[]; initialCompanyId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  function close() { dialog.current?.close(); }
  return <>
    <button type="button" className="boss-hr-action-primary" onClick={() => dialog.current?.showModal()}><UserPlus/><strong>Add Employee</strong><small>Choose a role, enter four details, and assign their dashboard</small><ArrowRight/></button>
    <dialog ref={dialog} className="boss-hr-hire-dialog" aria-labelledby="boss-hr-hire-title" onClose={() => setFormKey(key => key + 1)}>
      <header className="boss-hr-hire-dialog-header"><div><p className="eyebrow">BOSS DASHBOARD / PEOPLE</p><h2 id="boss-hr-hire-title">Add Employee</h2></div><button type="button" aria-label="Close" onClick={close}><X size={20}/></button></header>
      <HireEmployeeForm key={formKey} companies={companies} brands={brands} roleCatalogues={roleCatalogues} initialCompanyId={initialCompanyId} onClose={close}/>
    </dialog>
  </>;
}
