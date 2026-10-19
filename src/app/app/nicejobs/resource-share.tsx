"use client";
import { useState } from "react";
import { Copy, Mail, Share2 } from "lucide-react";
export function ResourceShare({ material }: { material: { title: string; text: string; url: string | null } }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const body = [material.text, material.url].filter(Boolean).join("\n\n");
  async function share(copy: boolean) {
    if (pending) return; setPending(true); setStatus("");
    try {
      if (copy) { await navigator.clipboard.writeText(body); setStatus("Material copied."); }
      else if (navigator.share) { await navigator.share({ title: material.title, text: material.text, ...(material.url ? { url: material.url } : {}) }); setStatus("Share dialog closed. Delivery is not confirmed."); }
      else setStatus("Sharing is unavailable in this browser. Use email or copy.");
    } catch (e) { setStatus(e instanceof Error && e.name === "AbortError" ? "Sharing cancelled." : "Could not share. Try email or copy."); }
    finally { setPending(false); }
  }
  return <section><h2>Approved customer material</h2><div className="nj-share-actions"><button className="button" disabled={pending} onClick={() => share(false)}><Share2 size={18} aria-hidden />Share</button><button className="button button-secondary" disabled={pending} onClick={() => share(true)}><Copy size={18} aria-hidden />Copy</button><a className="button button-secondary" href={`mailto:?subject=${encodeURIComponent(material.title)}&body=${encodeURIComponent(body)}`}><Mail size={18} aria-hidden />Email</a></div>{status && <p role="status">{status}</p>}</section>;
}
