"use client";
import { useState } from "react";

type Offer = { id: string; token: string; status: string; companyName: string; brandName: string | null; title: string; recipientName: string; subject: string; body: string };
export function HrOfferResponse({ offer }: { offer: Offer }) {
  const [status, setStatus] = useState(offer.status), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function decide(decision: "ACCEPT" | "DECLINE") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/hr/public-offers/${encodeURIComponent(offer.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: offer.token, decision }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "This offer can no longer be changed");
      setStatus(result.status); setMessage(decision === "ACCEPT" ? "Your acceptance has been recorded. The employer will follow up with onboarding details." : "Your response has been recorded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your response could not be recorded"); }
    finally { setBusy(false); }
  }
  return <main className="hr-public-offer"><p className="eyebrow">{offer.companyName}{offer.brandName ? ` / ${offer.brandName}` : ""}</p><h1>{offer.title}</h1><p><strong>Prepared for:</strong> {offer.recipientName}</p><p><strong>Subject:</strong> {offer.subject}</p><a className="button secondary" href={`/api/hr/public-offers/${encodeURIComponent(offer.id)}/pdf?token=${encodeURIComponent(offer.token)}`} target="_blank" rel="noopener noreferrer">Preview offer PDF</a><pre>{offer.body.replaceAll("[[OFFER_ACCEPTANCE_LINK]]", "This secure page is your acceptance link.")}</pre>{status === "SENT" ? <div className="hr-public-offer-actions"><button className="button" disabled={busy} onClick={() => decide("ACCEPT")}>{busy ? "Recording…" : "Accept offer"}</button><button className="button secondary" disabled={busy} onClick={() => decide("DECLINE")}>Decline offer</button></div> : <p className="status">Response status: {status.replaceAll("_", " ")}</p>}{message && <p role="status">{message}</p>}<p className="muted">Your response is recorded with a timestamp. This online response is not a cryptographic or statutory electronic signature.</p></main>;
}
