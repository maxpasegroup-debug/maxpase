"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, RotateCcw, X } from "lucide-react";

type Uploaded = { id: string; filename: string; mime: string; mediaType: string; bytes: number };
export function ContentUpload({ realm, base, organizationId, onUpload, onBusy }: { realm: string; base: string; organizationId: string; onUpload: (file: Uploaded) => void; onBusy: (busy: boolean) => void }) {
  const xhr = useRef<XMLHttpRequest | null>(null), key = useRef<string>(""), [file, setFile] = useState<File | null>(null), [status, setStatus] = useState("IDLE"), [progress, setProgress] = useState(0), [error, setError] = useState("");
  useEffect(() => () => { xhr.current?.abort(); }, []);
  const busy = status === "UPLOADING" || status === "VALIDATING";
  function upload() {
    if (!file || !organizationId || busy) return;
    if (!key.current) key.current = crypto.randomUUID();
    const request = new XMLHttpRequest(); xhr.current = request;
    const url = realm === "jobs" ? base.startsWith("/sites/jobs") ? "/sites/jobs/content/upload" : "/content/upload" : "/api/nicejobs/content/upload";
    request.open("POST", url); request.timeout = 120000;
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream"); request.setRequestHeader("x-file-name", encodeURIComponent(file.name)); request.setRequestHeader("x-organization-id", organizationId); request.setRequestHeader("x-upload-key", key.current);
    setError(""); setProgress(0); setStatus("UPLOADING"); onBusy(true);
    const fail = (message: string) => { setError(message); setStatus("FAILED"); onBusy(false); };
    request.upload.onprogress = event => { if (event.lengthComputable) { const p = Math.round(event.loaded / event.total * 100); setProgress(p); if (p === 100) setStatus("VALIDATING"); } };
    request.onload = () => { let result; try { result = JSON.parse(request.responseText); } catch { fail("Upload did not finish. Try again."); return; } if (request.status < 200 || request.status >= 300 || !result.id) { fail(result.error || "Upload failed. Try again."); return; } setStatus("SUCCEEDED"); onBusy(false); onUpload(result); };
    request.onerror = () => fail("Connection lost. Retry the same upload."); request.ontimeout = () => fail("Upload timed out. Retry to check its result."); request.onabort = () => fail("Upload cancelled. You can retry.");
    request.send(file);
  }
  return <fieldset className="nj-content-upload"><legend>Upload private file</legend><label>Video, audio, PDF or image<input type="file" accept=".mp4,.webm,.mp3,.wav,.m4a,.pdf,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); key.current = ""; setStatus("IDLE"); setError(""); setProgress(0); }} /></label>
    {busy && <><progress max={100} value={progress} aria-label="File upload progress" /><p role="status">{status === "VALIDATING" ? "Validating file..." : `Uploading ${progress}%`}</p><button type="button" title="Cancel upload" onClick={() => xhr.current?.abort()}><X size={16} aria-hidden="true" />Cancel</button></>}
    {!busy && status !== "SUCCEEDED" && <button className="button" type="button" disabled={!file || !organizationId} onClick={upload}>{status === "FAILED" ? <RotateCcw size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{status === "FAILED" ? "Retry upload" : "Upload file"}</button>}
    {error && <p role="alert">{error}</p>}{status === "SUCCEEDED" && <p role="status">File uploaded. Save the resource draft to attach it.</p>}
  </fieldset>;
}
