"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = { employmentId: string; identityEmail: string | null; contactEmail: string | null; contactPhone: string | null; emergencyContactName: string | null; emergencyContactRelationship: string | null; emergencyContactPhone: string | null; emergencyContactEmail: string | null; completeness: { complete: number; total: number; percent: number; missing: string[] } };

export function HrEmployeeProfileForm({ profile, editable }: { profile: Profile; editable: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function save(form: FormData) {
    setPending(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/hr/employees/${encodeURIComponent(profile.employmentId)}/profile`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Profile could not be saved");
      setMessage("Employee profile saved."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Profile could not be saved"); }
    finally { setPending(false); }
  }
  return <section className="executive-band boss-hr-profile-card"><header><div><h2>Employee profile</h2><p>Contact and emergency details for this company employment.</p></div><strong className="boss-hr-completeness-value">{profile.completeness.percent}% complete</strong></header>
    <div className="boss-hr-completeness"><div role="progressbar" aria-label="Employee profile completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={profile.completeness.percent}><span style={{ width: `${profile.completeness.percent}%` }}/></div><small>{profile.completeness.complete} of {profile.completeness.total} profile details recorded</small></div>
    {profile.completeness.missing.length > 0 && <p className="muted">Still needed: {profile.completeness.missing.join(", ")}.</p>}
    <form action={save} className="boss-hr-profile-form"><input type="hidden" name="employmentId" value={profile.employmentId}/>
      <fieldset><legend>Contact details</legend><label>Account email<input type="email" value={profile.identityEmail ?? "Not recorded"} readOnly aria-describedby="hr-identity-email-note"/></label><small id="hr-identity-email-note">Sign-in identity email. Change it from the People account record.</small><label>Work or preferred contact email<input name="contactEmail" type="email" maxLength={254} defaultValue={profile.contactEmail ?? ""} disabled={!editable}/></label><label>Phone<input name="contactPhone" type="tel" maxLength={24} defaultValue={profile.contactPhone ?? ""} placeholder="Include country code, e.g. +91" disabled={!editable}/></label></fieldset>
      <fieldset><legend>Emergency contact</legend><label>Full name<input name="emergencyContactName" maxLength={160} defaultValue={profile.emergencyContactName ?? ""} disabled={!editable}/></label><label>Relationship<input name="emergencyContactRelationship" maxLength={80} defaultValue={profile.emergencyContactRelationship ?? ""} placeholder="For example, spouse or parent" disabled={!editable}/></label><label>Phone<input name="emergencyContactPhone" type="tel" maxLength={24} defaultValue={profile.emergencyContactPhone ?? ""} disabled={!editable}/></label><label>Email (optional)<input name="emergencyContactEmail" type="email" maxLength={254} defaultValue={profile.emergencyContactEmail ?? ""} disabled={!editable}/></label></fieldset>
      {editable && <button className="button" disabled={pending}>{pending ? "Saving…" : "Save employee profile"}</button>}{!editable && <p>Ended employment records are read-only.</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    </form>
    <p className="boss-hr-sensitive-note">Government identity numbers are intentionally not stored in this profile. Store identity files only when required, using the private Documents area.</p>
  </section>;
}
