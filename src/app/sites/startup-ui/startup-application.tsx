"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import "./startup-application.css";

type Form = { fullName: string; mobile: string; whatsapp: string; email: string; education: string; dateOfBirth: string; country: string; city: string; state: string };
type Draft = { answers?: Partial<Form>; reference?: string | null; submittedAt?: string | null; status?: string };
type Receipt = { reference: string; status: string };
const empty: Form = { fullName: "", mobile: "", whatsapp: "", email: "", education: "", dateOfBirth: "", country: "IN", city: "", state: "" };
const states = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];
const keralaCities = ["Alappuzha", "Ernakulam", "Kannur", "Kasaragod", "Kochi", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"];
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries().map(code => ({ code, name: regionNames.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` })).sort((a, b) => a.code === "IN" ? -1 : b.code === "IN" ? 1 : a.name.localeCompare(b.name));
function ageFromDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== value) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getUTCFullYear();
  if (today.getMonth() < birth.getUTCMonth() || today.getMonth() === birth.getUTCMonth() && today.getDate() < birth.getUTCDate()) age--;
  return age >= 0 ? age : null;
}
const endpoint = "/api/startup/public-application/";
async function request<T>(action: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<T> {
  const response = await fetch(endpoint + action, { method, credentials: "same-origin", cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "We could not save this application. Please try again.");
  return data as T;
}

export function StartupApplicationPage({ home, login }: { home: string; login: string }) {
  const [form, setForm] = useState<Form>(empty);
  const [mobileCountry, setMobileCountry] = useState<CountryCode>("IN");
  const [nationalNumber, setNationalNumber] = useState("");
  const [sameWhatsApp, setSameWhatsApp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"details" | "location" | "done">("details");
  const [consent, setConsent] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [stateChoice, setStateChoice] = useState("");
  const [cityChoice, setCityChoice] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true); setDraftReady(false); setError("");
    (async () => {
      try {
        let draft: Draft;
        try { draft = await request<Draft>("draft", "GET"); }
        catch { draft = await request<Draft>("draft", "POST", {}); }
        if (!alive) return;
        setDraftReady(true);
        const answers = { ...empty, ...(draft.answers ?? {}) };
        setForm(answers);
        const parsedMobile = answers.mobile ? parsePhoneNumberFromString(answers.mobile) : null;
        if (parsedMobile?.country) { setMobileCountry(parsedMobile.country); setNationalNumber(parsedMobile.nationalNumber); }
        setSameWhatsApp(!answers.whatsapp || answers.whatsapp === answers.mobile);
        const savedState = draft.answers?.state ?? "";
        const savedCity = draft.answers?.city ?? "";
        setStateChoice(states.includes(savedState) ? savedState : savedState ? "OTHER" : "");
        setCityChoice(keralaCities.includes(savedCity) ? savedCity : savedCity ? "OTHER" : "");
        if (draft.reference && draft.submittedAt) { setReceipt({ reference: draft.reference, status: draft.status ?? "SUBMITTED" }); setStep("done"); }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "The application service is unavailable."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload]);
  function update(key: keyof Form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  function mobileNumber() {
    const parsed = parsePhoneNumberFromString(nationalNumber, mobileCountry);
    return parsed?.isValid() && parsed.country === mobileCountry ? parsed.number : null;
  }
  function detailsIssue() {
    if (form.fullName.trim().length < 2) return "Enter your full name.";
    if (!mobileNumber()) return "Enter a valid mobile number for the selected country.";
    if (!sameWhatsApp && !parsePhoneNumberFromString(form.whatsapp.trim())?.isValid()) return "Enter a valid WhatsApp number with country code.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email address.";
    if (!form.education) return "Choose your education level.";
    if (ageFromDate(form.dateOfBirth) === null) return "Enter a valid date of birth.";
    return "";
  }
  async function toLocation() {
    const issue = detailsIssue();
    if (issue) { setError(issue); return; }
    setBusy(true); setError("");
    try {
      const mobile = mobileNumber()!;
      const cleanForm = { ...form, mobile, whatsapp: sameWhatsApp ? mobile : form.whatsapp.trim(), email: form.email.trim() };
      await request("draft", "PATCH", cleanForm);
      setForm(cleanForm);
      setStep("location");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your details."); }
    finally { setBusy(false); }
  }
  async function submit() {
    const issue = detailsIssue();
    if (issue) { setStep("details"); setError(issue); return; }
    if (!form.country || form.state.trim().length < 2 || form.city.trim().length < 2) { setError("Choose your country, state and city."); return; }
    if (!consent) { setError("Please agree to the application review notice."); return; }
    setBusy(true); setError("");
    try { const mobile = mobileNumber()!; const result = await request<Receipt>("submit", "POST", { ...form, mobile, whatsapp: sameWhatsApp ? mobile : form.whatsapp.trim(), consent: true }); setReceipt(result); setStep("done"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your application was not submitted."); }
    finally { setBusy(false); }
  }

  return <main className="startup-application-page">
    <header className="startup-application-header">
      <Link href={home} className="startup-application-wordmark">AIRA STARTUP SKOOL</Link>
      <Link href={login} className="startup-application-login">Already applied? Sign in <ArrowRight size={16}/></Link>
    </header>
    <div className="startup-application-layout">
      <aside className="startup-application-intro">
        <p className="startup-application-kicker">YOUR ENTREPRENEUR JOURNEY</p>
        <h1>Make your first move.</h1>
        <p>Tell us a little about yourself. Our admissions team will review your application and guide you through the next step.</p>
        <Link href={home} className="startup-application-back">← Back to AIRA Startup Skool</Link>
      </aside>
      <section className="startup-apply-dialog" aria-labelledby="startup-apply-title" aria-describedby="startup-apply-intro">
        <p className="startup-apply-eyebrow">AIRA STARTUP SKOOL · APPLICATION</p>
        <h2 id="startup-apply-title">{step === "done" ? "Application received" : step === "location" ? "Where are you based?" : "Start your application"}</h2>
        <p id="startup-apply-intro" className="startup-apply-lead">{step === "details" ? "A few details to begin. This takes about two minutes." : step === "location" ? "Your location helps the admissions team guide you." : "An Administrative Officer will review your details."}</p>
        {step !== "done" && <div className="startup-apply-progress" role="progressbar" aria-label="Application progress" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step === "details" ? 1 : 2}><span className="is-current"/><span className={step === "location" ? "is-current" : ""}/></div>}
        {(step === "details" || step === "location") && (loading ? <p role="status">Opening your secure application…</p> : !draftReady ? <div className="startup-apply-unavailable" role="alert"><p>{error || "The application is temporarily unavailable."}</p><button type="button" onClick={() => setReload(value => value + 1)}>Try again</button></div> : <>
          {step === "details" ? <div className="startup-apply-grid">
            <label>Full name<input autoComplete="name" value={form.fullName} onChange={e=>update("fullName",e.target.value)} /></label>
            <label>Mobile number<span className="startup-phone-row"><select aria-label="Mobile country code" value={mobileCountry} onChange={e=>setMobileCountry(e.target.value as CountryCode)}>{countries.map(row=><option key={row.code} value={row.code}>{row.name} ({row.dial})</option>)}</select><input aria-label="Mobile number" autoComplete="tel-national" inputMode="tel" value={nationalNumber} onChange={e=>setNationalNumber(e.target.value)} placeholder="Mobile number" /></span></label>
            <label className="startup-apply-span"><span className="startup-whatsapp-check"><input type="checkbox" checked={sameWhatsApp} onChange={e=>setSameWhatsApp(e.target.checked)}/> WhatsApp is the same as my mobile number</span></label>
            {!sameWhatsApp && <label>WhatsApp number<input autoComplete="tel" inputMode="tel" value={form.whatsapp} onChange={e=>update("whatsapp",e.target.value)} placeholder="+ country code and number" /></label>}
            <label>Email<input autoComplete="email" type="email" value={form.email} onChange={e=>update("email",e.target.value)} /></label>
            <label>Education<select value={form.education} onChange={e=>update("education",e.target.value)}><option value="">Choose your education</option><option value="SECONDARY">Secondary school</option><option value="HIGHER_SECONDARY">Higher secondary</option><option value="DIPLOMA">Diploma</option><option value="UNDERGRADUATE">Undergraduate</option><option value="POSTGRADUATE">Postgraduate</option><option value="OTHER">Other</option></select></label>
            <label>Date of birth<input type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0,10)} onChange={e=>update("dateOfBirth",e.target.value)} /></label>
            <label>Age<input value={ageFromDate(form.dateOfBirth) ?? ""} readOnly aria-label="Age calculated from date of birth" placeholder="Calculated automatically" /></label>
          </div> : <div className="startup-apply-grid">
            <label>Country of residence<select value={form.country} onChange={e=>{setForm(current => ({...current,country:e.target.value,state:"",city:""}));setStateChoice("");setCityChoice("")}}><option value="">Choose your country</option>{countries.map(row=><option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
            <label>State or region<select value={stateChoice} onChange={e=>{setStateChoice(e.target.value);setCityChoice("");setForm(current => ({...current,state:e.target.value === "OTHER" ? "" : e.target.value,city:""}))}}><option value="">Choose your state or region</option>{form.country === "IN" && states.map(state=><option key={state}>{state}</option>)}<option value="OTHER">Other region</option></select></label>
            {stateChoice === "OTHER" && <label>Enter your state or region<input autoComplete="address-level1" value={form.state} onChange={e=>update("state",e.target.value)} /></label>}
            <label>City<select value={cityChoice} onChange={e=>{setCityChoice(e.target.value);update("city",e.target.value === "OTHER" ? "" : e.target.value)}}><option value="">Choose your city</option>{form.country === "IN" && form.state === "Kerala" && keralaCities.map(city=><option key={city}>{city}</option>)}<option value="OTHER">Other city</option></select></label>
            {cityChoice === "OTHER" && <label>Enter your city<input autoComplete="address-level2" value={form.city} onChange={e=>update("city",e.target.value)} /></label>}
          </div>}
          {step === "location" && <label className="startup-apply-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree that AIRA Startup Skool may use my details to review my application and contact me. The admissions team will check my contact details.</label>}
          {error && <p className="startup-apply-error" role="alert">{error}</p>}
          {step === "details" ? <button className="startup-apply-primary" type="button" disabled={busy} onClick={()=>void toLocation()}>{busy?"Saving…":"Continue"} <ArrowRight size={16}/></button> : <><button className="startup-apply-primary" type="button" disabled={busy||!consent} onClick={()=>void submit()}>{busy?"Submitting…":"Apply now"} <ArrowRight size={16}/></button><button type="button" className="startup-apply-text" onClick={() => {setError("");setStep("details")}}>Back to your details</button></>}
          <small className="startup-apply-note">No code is needed. An Administrative Officer reviews your application and contact details. Applying does not create a login account or guarantee admission.</small>
        </>)}
        {step === "done" && <div className="startup-apply-success"><p>Your application was received by AIRA Startup Skool and is waiting for human review.</p>{receipt&&<><span>Application reference</span><strong>{receipt.reference}</strong></>}</div>}
      </section>
    </div>
  </main>;
}
