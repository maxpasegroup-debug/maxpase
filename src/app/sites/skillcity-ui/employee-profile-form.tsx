"use client";
import { useState } from "react";

type ProfileValues = { employmentId: string; displayName: string; workEmail: string; contactEmail: string | null; contactPhone: string | null; emergencyContactName: string | null; emergencyContactRelationship: string | null; emergencyContactPhone: string | null; emergencyContactEmail: string | null };
const inputStyle = { width: "100%", minHeight: 44, border: "1px solid #d8c9ef", borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,.82)", color: "#211535" } as const;
export function EmployeeProfileForm({ profile }: { profile: ProfileValues }) {
  const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/hr/self-profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data)) });
    const result = await response.json().catch(() => ({}));
    setSaving(false); setMessage(response.ok ? "Profile saved to your employee record." : result.error || "Profile could not be saved.");
  }
  const field = (label: string, name: string, value: string | null, options: { type?: string; required?: boolean; readOnly?: boolean } = {}) => <label style={{ display: "grid", gap: 6, fontWeight: 600 }}>{label}<input style={inputStyle} name={options.readOnly ? undefined : name} type={options.type ?? "text"} defaultValue={value ?? ""} required={options.required} readOnly={options.readOnly} maxLength={254}/></label>;
  return <form onSubmit={submit} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
    <input type="hidden" name="employmentId" value={profile.employmentId}/>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
      {field("Full name", "displayName", profile.displayName, { required: true })}
      {field("Work email (sign-in identity)", "workEmail", profile.workEmail, { readOnly: true })}
      {field("Preferred contact email", "contactEmail", profile.contactEmail, { type: "email" })}
      {field("Contact mobile", "contactPhone", profile.contactPhone, { type: "tel" })}
      {field("Emergency contact name", "emergencyContactName", profile.emergencyContactName)}
      {field("Relationship", "emergencyContactRelationship", profile.emergencyContactRelationship)}
      {field("Emergency contact mobile", "emergencyContactPhone", profile.emergencyContactPhone, { type: "tel" })}
      {field("Emergency contact email", "emergencyContactEmail", profile.emergencyContactEmail, { type: "email" })}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}><button className="button" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button><span role="status" aria-live="polite">{message}</span></div>
    <p>Your work email and sign-in phone are managed by your company. This form updates your employee profile and contact details.</p>
  </form>;
}
