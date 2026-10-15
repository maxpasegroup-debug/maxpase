"use client";
import { useState } from "react";
import { Download, Mail, Share2 } from "lucide-react";

export function OfferShare({ reference, downloadHref, title }: { reference: string; downloadHref: string; title: string }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  async function share() {
    setPending(true); setMessage("");
    try {
      const response = await fetch(downloadHref, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Offer download unavailable. Sign in again or retry.");
      const file = new File([await response.blob()], `offer-${reference}.html`, { type: "text/html" });
      if (!navigator.canShare?.({ files: [file] })) { setMessage("File sharing is unavailable in this browser. The download and email draft remain available."); return; }
      await navigator.share({ files: [file], title });
      setMessage("Offer handed to the selected sharing application. Delivery is not verified.");
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Sharing unavailable"); }
    finally { setPending(false); }
  }
  return <div className="nj-actions"><a className="button button-secondary" href={`${downloadHref}?format=eml`} download><Mail size={16} />Email draft with attachment</a><a className="button button-secondary" href={downloadHref} download><Download size={16} />Download offer</a><a className="button button-secondary" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`My offer reference: ${reference}\n${title}\nI will attach my downloaded offer document.`)}`}><Mail size={16} />Compose email</a><button className="button button-secondary" type="button" disabled={pending} onClick={share}><Share2 size={16} />{pending ? "Preparing" : "Share offer file"}</button>{message && <p role="status">{message}</p>}<p>WhatsApp delivery: provider and consent setup pending.</p></div>;
}
