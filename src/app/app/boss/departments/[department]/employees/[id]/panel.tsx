"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Document = { id: string; categoryKey: string; title: string; filename: string; mime: string; bytes: number; status: string; employeeVisible: boolean; brandId: string | null; brand: { name: string } | null; replacesId: string | null; createdAt: string; archivedAt: string | null };
type Category = { key: string; label: string };
export function HrDocumentPanel({ employmentId, companyId, employeeName, activeEmployment, configured, categories, assignments, documents, selectedCategory, search }: { employmentId: string; companyId: string; employeeName: string; activeEmployment: boolean; configured: boolean; categories: Category[]; assignments: { id: string; name: string }[]; documents: Document[]; selectedCategory: string; search: string }) {
  const router = useRouter(), file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [replace, setReplace] = useState<Document | null>(null), [history, setHistory] = useState<Record<string, { eventType: string; createdAt: string; status: string; actor: { email: string } | null }[]>>({});
  async function upload(form: FormData) {
    setBusy(true); setError(""); setMessage("");
    try {
      form.set("employmentId", employmentId);
      if (replace) { form.set("replacesId", replace.id); form.set("brandId", replace.brandId ?? ""); form.set("categoryKey", replace.categoryKey); }
      const result = await fetch("/api/hr/documents", { method: "POST", body: form, credentials: "same-origin" });
      if (!result.ok) throw new Error((await result.json()).error ?? "Upload failed");
      setMessage(replace ? "Replacement saved; the earlier version remains in history." : "Document uploaded.");
      setReplace(null); if (file.current) file.current.value = ""; router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function archive(id: string) {
    if (!window.confirm("Archive this document? The file and history will be retained.")) return;
    setBusy(true); setError("");
    try { const result = await fetch(`/api/hr/documents/${encodeURIComponent(id)}/archive`, { method: "POST", credentials: "same-origin" }); if (!result.ok) throw new Error("Archive failed"); setMessage("Document archived."); router.refresh(); }
    catch { setError("Could not archive this document."); } finally { setBusy(false); }
  }
  async function setVisibility(id: string, visible: boolean) {
    if (!window.confirm(visible ? "Share this private document with the employee?" : "Remove employee access to this document?")) return;
    setBusy(true); setError("");
    try { const result = await fetch(`/api/hr/documents/${encodeURIComponent(id)}/employee-visibility`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visible }) }); if (!result.ok) throw new Error(); setMessage(visible ? "Document shared with employee." : "Employee access removed."); router.refresh(); }
    catch { setError("Document sharing could not be changed."); } finally { setBusy(false); }
  }
  async function showHistory(id: string) {
    try { const result = await fetch(`/api/hr/documents/${encodeURIComponent(id)}/history`, { credentials: "same-origin" }); if (!result.ok) throw new Error(); const body = await result.json(); setHistory(previous => ({ ...previous, [id]: body.events })); }
    catch { setError("Document history is unavailable."); }
  }
  return <><section className="executive-band"><h2>Documents</h2><p>Private records for {employeeName}. Company and brand scope are checked for every action.</p>{!configured && <p role="status">Private document storage is not configured. Upload and download are unavailable.</p>}
    <form method="get" className="list-toolbar"><input type="hidden" name="tab" value="documents"/><label>Category <select name="category" defaultValue={selectedCategory}><option value="">All categories</option>{categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label><label>Search titles <input type="search" name="search" defaultValue={search} maxLength={100}/></label><button className="button secondary">Filter</button></form>
    {!documents.length && <p>No documents match this view.</p>}{documents.length > 0 && <div className="table-scroll"><table className="business-table"><thead><tr><th>Document</th><th>Category</th><th>Scope</th><th>Status</th><th>Actions</th></tr></thead><tbody>{documents.map(doc => <tr key={doc.id}><td><strong>{doc.title}</strong><br/><small>{doc.filename} · {(doc.bytes / 1024).toFixed(0)} KB · {new Date(doc.createdAt).toLocaleDateString()}</small></td><td>{categories.find(c => c.key === doc.categoryKey)?.label ?? doc.categoryKey}</td><td>{doc.brand?.name ?? "Company HR"}</td><td>{doc.status}</td><td><div className="boss-hr-doc-actions">{configured && ["ACTIVE", "REPLACED", "ARCHIVED"].includes(doc.status) && <><a href={`/api/hr/documents/${encodeURIComponent(doc.id)}?open=1`} target="_blank" rel="noopener noreferrer">Open</a><a href={`/api/hr/documents/${encodeURIComponent(doc.id)}`}>Download</a></>}{doc.status === "ACTIVE" && activeEmployment && <><button type="button" disabled={busy || !configured} onClick={() => { setReplace(doc); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Replace</button><button type="button" disabled={busy} onClick={() => archive(doc.id)}>Archive</button></>}{doc.status === "ACTIVE" && <button type="button" disabled={busy} onClick={() => setVisibility(doc.id, !doc.employeeVisible)}>{doc.employeeVisible ? "Remove employee access" : "Share with employee"}</button>}<button type="button" onClick={() => showHistory(doc.id)}>History</button></div>{history[doc.id] && <ul>{history[doc.id].map((item,index) => <li key={index}>{item.eventType.replaceAll("_", " ")} · {new Date(item.createdAt).toLocaleString()} · {item.status} · {item.actor?.email ?? "System"}</li>)}</ul>}</td></tr>)}</tbody></table></div>}
    </section>{activeEmployment && <section className="executive-band"><h2>{replace ? `Replace ${replace.title}` : "Upload document"}</h2>{replace && <button type="button" className="button secondary" onClick={() => setReplace(null)}>Cancel replacement</button>}<form action={upload} className="boss-hr-document-form"><label>Title <input name="title" defaultValue={replace?.title ?? ""} required minLength={2} maxLength={160}/></label><label>Category <select name="categoryKey" defaultValue={replace?.categoryKey ?? ""} required disabled={!!replace}><option value="">Select category</option>{categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label><label>Access scope <select name="brandId" defaultValue={replace?.brandId ?? ""} disabled={!!replace}><option value="">Company HR</option>{assignments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>PDF or image, up to 10 MB <input ref={file} name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required/></label><button className="button" disabled={busy || !configured}>{busy ? "Uploading…" : replace ? "Save replacement" : "Upload privately"}</button></form>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</section>}
    <section className="executive-band"><h2>Custom category</h2><p>Group HR may add a company category. This does not change document access.</p><form className="boss-hr-document-form" onSubmit={async event => { event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const result = await fetch("/api/hr/documents/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, key: form.get("key"), label: form.get("label") }) }); if (result.ok) { setMessage("Category added."); router.refresh(); } else setError("Category could not be added."); }}><label>Key <input name="key" required pattern="[A-Z][A-Z0-9_]{1,39}" placeholder="CUSTOM_CATEGORY"/></label><label>Label <input name="label" required minLength={2} maxLength={100}/></label><button className="button secondary">Add category</button></form></section></>;
}
