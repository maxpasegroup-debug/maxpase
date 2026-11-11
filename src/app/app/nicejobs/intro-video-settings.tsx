"use client";
import { useActionState, useEffect, useState } from "react";
import { publishNiceJobsIntroVideo, type IntroVideoActionState } from "./portal-setting-actions";
import { ContentUpload } from "./content-upload";

export function IntroVideoSettings({ title, url, fileId, organizationId, base }: { title: string; url: string | null; fileId: string | null; organizationId: string; base: string }) {
  const [state, action, pending] = useActionState(publishNiceJobsIntroVideo, {} as IntroVideoActionState);
  const [preview, setPreview] = useState(url), [previewTitle, setPreviewTitle] = useState(title), [duration, setDuration] = useState<number | null>(null), [uploadedFileId, setUploadedFileId] = useState(fileId), [selectedFile, setSelectedFile] = useState<File | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (!selectedFile) { setPreview(url); return; } const local = URL.createObjectURL(selectedFile); setPreview(local); return () => URL.revokeObjectURL(local); }, [selectedFile, url]);
  return <section className="nj-workspace">
    <h1>Nice Jobs introduction video</h1>
    <p>Upload an MP4 or WebM video. It stays private until you publish it here. The public Continue button appears only when the video reaches its end.</p>
    <form action={action} className="nj-form" aria-busy={pending}>
      <label>Video title<input name="title" defaultValue={title} required minLength={3} maxLength={100} onChange={event => setPreviewTitle(event.target.value)} /></label>
      <input type="hidden" name="fileId" value={uploadedFileId ?? ""} />
      <ContentUpload realm="corporate" base={base} organizationId={organizationId} accept=".mp4,.webm" label="MP4 or WebM video" legend="Upload introduction video" successMessage="Video uploaded privately. Preview it below before publishing." onBusy={setBusy} onSelected={file => { setSelectedFile(file); setUploadedFileId(null); setDuration(null); }} onUpload={file => setUploadedFileId(file.id)} />
      <button className="button" disabled={pending || busy || !uploadedFileId}>{pending ? "Publishing…" : "Publish video"}</button>
    </form>
    <h2>Preview before publishing</h2><h3>{previewTitle || "What is NICEJOBS?"}</h3>
    {preview ? <><video key={preview} src={preview} controls playsInline preload="metadata" onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null)} style={{ width: "min(100%, 720px)", borderRadius: 12, background: "#111" }} aria-label="Introduction video preview" />{duration !== null && <p role="status">Preview duration: {Math.round(duration)} seconds{duration >= 45 && duration <= 75 ? " — suitable for an approximately one-minute introduction." : " — adjust this video to about one minute before publishing."}</p>}</> : <p>No video is published yet.</p>}
    {state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <p>Changing this setting affects the public Nice Jobs landing page immediately. Use a clear introduction around one minute long.</p>
  </section>;
}
