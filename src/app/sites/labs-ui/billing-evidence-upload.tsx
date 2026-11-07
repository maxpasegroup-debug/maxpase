"use client";
import { useState } from "react";
const types = ["CERTIFICATE_OF_INCORPORATION", "GST_CERTIFICATE", "PAN_EVIDENCE", "ADDRESS_PROOF", "BANK_PROOF", "SIGNATORY_EVIDENCE"] as const;
const display = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());

export function BillingEvidenceUpload({ base, canManage, vendorBillId }: { base: string; canManage: boolean; vendorBillId?: string }) {
  const [type, setType] = useState<string>(vendorBillId ? "VENDOR_BILL" : "GST_CERTIFICATE"), [file, setFile] = useState<File | null>(null), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  if (!canManage) return null;
  return <form className="al-form" onSubmit={async event => {
    event.preventDefault(); if (!file) { setMessage("Choose a PDF or image file."); return; }
    setPending(true); setMessage("");
    try {
      const response = await fetch(`${base.replace(/\/gateway$/, "")}/billing-evidence`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-Evidence-Type": type, ...(vendorBillId ? { "X-Vendor-Bill-Id": vendorBillId } : {}) }, body: file, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Upload failed");
      setMessage(`${display(type)} uploaded. Reloading the evidence list.`); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Private evidence storage is unavailable."); }
    finally { setPending(false); }
  }}>
    {!vendorBillId && <label>Evidence type<select value={type} onChange={event => setType(event.target.value)}>{types.map(value => <option key={value} value={value}>{display(value)}</option>)}</select></label>}
    <label>PDF or image, up to 20 MB<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>
    {message && <p role="status">{message}</p>}<button className="al-button" disabled={pending}>{pending ? "Uploading…" : "Upload private evidence"}</button>
  </form>;
}
