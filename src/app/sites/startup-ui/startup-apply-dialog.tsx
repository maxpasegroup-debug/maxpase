"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import "./startup-apply-dialog.css";

type Form = { fullName: string; mobile: string; email: string; education: string; dateOfBirth: string; country: string; city: string; district: string; state: string };
type Draft = { answers?: Partial<Form>; verified?: boolean; reference?: string | null; submittedAt?: string | null; status?: string };
type Challenge = { challengeId: string; expiresAt: string; resendAfter: string };
type Receipt = { reference: string; status: string };
const empty: Form = { fullName: "", mobile: "+91", email: "", education: "", dateOfBirth: "", country: "IN", city: "", district: "", state: "" };
const states = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];
const keralaCities = ["Alappuzha", "Ernakulam", "Kannur", "Kasaragod", "Kochi", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"];
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = Array.from({ length: 26 * 26 }, (_, index) => String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26)).map(code => ({ code, name: regionNames.of(code) ?? code })).filter(row => row.name !== row.code).sort((a, b) => a.code === "IN" ? -1 : b.code === "IN" ? 1 : a.name.localeCompare(b.name));
const endpoint = "/api/startup/public-application/";
async function request<T>(action: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<T> {
  const response = await fetch(endpoint + action, { method, credentials: "same-origin", cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "We could not save this application. Please try again.");
  return data as T;
}

export function StartupApplyButton({ label = "Apply now", className = "ax-pill" }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"details" | "verify" | "done">("details");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [consent, setConsent] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [stateChoice, setStateChoice] = useState("");
  const [cityChoice, setCityChoice] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); setError("");
    (async () => {
      try {
        let draft: Draft;
        try { draft = await request<Draft>("draft", "GET"); }
        catch { draft = await request<Draft>("draft", "POST", {}); }
        if (!alive) return;
        setForm({ ...empty, ...(draft.answers ?? {}) });
        const savedState = draft.answers?.state ?? "";
        const savedCity = draft.answers?.city ?? "";
        setStateChoice(states.includes(savedState) ? savedState : savedState ? "OTHER" : "");
        setCityChoice(keralaCities.includes(savedCity) ? savedCity : savedCity ? "OTHER" : "");
        if (draft.reference && draft.submittedAt) { setReceipt({ reference: draft.reference, status: draft.status ?? "SUBMITTED" }); setStep("done"); }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "The application service is unavailable."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);

  function close() { if (busy) return; setOpen(false); setError(""); }
  function update(key: keyof Form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  function validate() {
    if (form.fullName.trim().length < 2) return "Enter your full name.";
    const mobile = form.mobile.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(mobile)) return "Enter a valid mobile number with country code, such as +919876543210.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email address.";
    if (!form.education) return "Choose your education level.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) || Number.isNaN(Date.parse(form.dateOfBirth)) || form.dateOfBirth > new Date().toISOString().slice(0, 10)) return "Enter a valid date of birth.";
    if (!form.country) return "Choose your country.";
    if (form.city.trim().length < 2 || form.district.trim().length < 2 || !form.state) return "Enter your city and district, then choose your state.";
    return "";
  }
  async function sendCode() {
    const validation = validate(); if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    try {
      const mobile = form.mobile.replace(/[\s()-]/g, "");
      const cleanForm = { ...form, mobile };
      await request("draft", "PATCH", cleanForm);
      const sent = await request<Challenge>("otp-send", "POST", { mobile });
      setForm(cleanForm);
      setChallenge(sent); setStep("verify");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the verification code."); }
    finally { setBusy(false); }
  }
  async function verifyCode() {
    if (!challenge || !/^\d{6}$/.test(code)) { setError("Enter the six-digit code sent to your phone."); return; }
    setBusy(true); setError("");
    try { await request("otp-verify", "POST", { challengeId: challenge.challengeId, code }); setVerified(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The code could not be verified."); }
    finally { setBusy(false); }
  }
  async function resendCode() {
    setBusy(true); setError(""); setCode("");
    try { setChallenge(await request<Challenge>("otp-send", "POST", { mobile: form.mobile })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resend the code."); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!verified) { setError("Verify your mobile number before submitting."); return; }
    if (!consent) { setError("Please agree to the application review notice."); return; }
    setBusy(true); setError("");
    try { const result = await request<Receipt>("submit", "POST", { ...form, consent: true }); setReceipt(result); setStep("done"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your application was not submitted."); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" className={className} onClick={() => setOpen(true)}>{label} <ArrowRight size={16} /></button>
    {open && <div className="startup-apply-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="startup-apply-dialog" role="dialog" aria-modal="true" aria-labelledby="startup-apply-title">
        <button type="button" className="startup-apply-close" aria-label="Close application" onClick={close}><X size={20}/></button>
        <p className="startup-apply-eyebrow">AIRA STARTUP SKOOL · APPLICATION</p>
        <h2 id="startup-apply-title">{step === "done" ? "Application received" : step === "verify" ? "Verify your mobile" : "Your first step starts here."}</h2>
        {step === "details" && <>
          <p className="startup-apply-lead">Share a few details. The admissions team will review your application.</p>
          {loading ? <p role="status">Opening your secure application…</p> : <div className="startup-apply-grid">
            <label>Full name<input autoComplete="name" value={form.fullName} onChange={e=>update("fullName",e.target.value)} /></label>
            <label>Contact number<input autoComplete="tel" inputMode="tel" value={form.mobile} onChange={e=>update("mobile",e.target.value)} /></label>
            <label>Email<input autoComplete="email" type="email" value={form.email} onChange={e=>update("email",e.target.value)} /></label>
            <label>Education<select value={form.education} onChange={e=>update("education",e.target.value)}><option value="">Choose your education</option><option value="SECONDARY">Secondary school</option><option value="HIGHER_SECONDARY">Higher secondary</option><option value="DIPLOMA">Diploma</option><option value="UNDERGRADUATE">Undergraduate</option><option value="POSTGRADUATE">Postgraduate</option><option value="OTHER">Other</option></select></label>
            <label>Date of birth<input type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0,10)} onChange={e=>update("dateOfBirth",e.target.value)} /></label>
            <label>Country<select value={form.country} onChange={e=>{setForm(current => ({...current,country:e.target.value,state:"",city:"",district:""}));setStateChoice("");setCityChoice("")}}><option value="">Choose your country</option>{countries.map(row=><option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
            <label>State or region<select value={stateChoice} onChange={e=>{setStateChoice(e.target.value);setCityChoice("");setForm(current => ({...current,state:e.target.value === "OTHER" ? "" : e.target.value,city:""}))}}><option value="">Choose your state or region</option>{form.country === "IN" && states.map(state=><option key={state}>{state}</option>)}<option value="OTHER">Other region</option></select></label>
            {stateChoice === "OTHER" && <label>Enter your state or region<input autoComplete="address-level1" value={form.state} onChange={e=>update("state",e.target.value)} /></label>}
            <label>City<select value={cityChoice} onChange={e=>{setCityChoice(e.target.value);update("city",e.target.value === "OTHER" ? "" : e.target.value)}}><option value="">Choose your city</option>{form.country === "IN" && form.state === "Kerala" && keralaCities.map(city=><option key={city}>{city}</option>)}<option value="OTHER">Other city</option></select></label>
            {cityChoice === "OTHER" && <label>Enter your city<input autoComplete="address-level2" value={form.city} onChange={e=>update("city",e.target.value)} /></label>}
            <label>District<input autoComplete="address-level2" value={form.district} onChange={e=>update("district",e.target.value)} /></label>
          </div>}
          {error && <p className="startup-apply-error" role="alert">{error}</p>}
          <button className="startup-apply-primary" type="button" disabled={busy||loading} onClick={()=>void sendCode()}>{busy?"Sending code…":"Continue to verification"} <ArrowRight size={16}/></button>
          <small className="startup-apply-note">We’ll verify your mobile number before sending this for review. This application does not create a login account or guarantee admission.</small>
        </>}
        {step === "verify" && <>
          <p className="startup-apply-lead">Enter the six-digit code sent to <strong>{form.mobile}</strong>. The code expires in 10 minutes.</p>
          <label className="startup-apply-code">Six-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
          {error && <p className="startup-apply-error" role="alert">{error}</p>}
          {!verified ? <button className="startup-apply-primary" type="button" disabled={busy} onClick={()=>void verifyCode()}>{busy?"Verifying…":"Verify number"}</button> : <>
            <p className="startup-apply-verified" role="status">Mobile number verified.</p>
            <label className="startup-apply-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree that AIRA Startup Skool may use these details to review my application and contact me about it.</label>
            <button className="startup-apply-primary" type="button" disabled={busy||!consent} onClick={()=>void submit()}>{busy?"Submitting…":"Submit application for review"} <ArrowRight size={16}/></button>
          </>}
          {!verified && challenge && <button type="button" className="startup-apply-text" disabled={busy} onClick={()=>void resendCode()}>{busy?"Sending…":"Resend code"}</button>}
          <button type="button" className="startup-apply-text" disabled={busy} onClick={()=>{setStep("details");setVerified(false);setChallenge(null);setCode("");setError("")}}>Back to details</button>
        </>}
        {step === "done" && <div className="startup-apply-success"><p>Your application was received by AIRA Startup Skool and is waiting for human review.</p>{receipt&&<><span>Application reference</span><strong>{receipt.reference}</strong></>}</div>}
      </section>
    </div>}
  </>;
}
