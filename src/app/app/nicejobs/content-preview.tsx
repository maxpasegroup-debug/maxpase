"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
export function ContentPreview({ realm, base, versionId, management, filename, mime, captions, transcript, applicationReference }: { realm: string; base: string; versionId: string; management: boolean; filename: string; mime: string; captions: string; transcript: string; applicationReference?: string }) {
  const root = realm === "jobs" ? base.startsWith("/sites/jobs") ? "/sites/jobs/content" : "/content" : "/api/nicejobs/content";
  const url = `${root}/${encodeURIComponent(versionId)}?management=${management}${applicationReference ? "&applicationReference=" + encodeURIComponent(applicationReference) : ""}`, preview = url + "&preview=true";
  const [captionUrl,setCaptionUrl] = useState<string>();
  const [playback,setPlayback]=useState("No playback observation in this browser");
  useEffect(()=>setPlayback("No playback observation in this browser"),[versionId]);
  useEffect(() => { if (!captions.startsWith("WEBVTT")) return; const object = URL.createObjectURL(new Blob([captions],{type:"text/vtt"})); setCaptionUrl(object); return () => URL.revokeObjectURL(object); },[captions]);
  return <section className="nj-content-preview"><h2>{management ? "File preview" : "Resource file"}</h2>
    {mime.startsWith("video/") ? <video onPlay={()=>setPlayback("Playback started")} onEnded={()=>setPlayback("Player reported an end event")} controls preload="metadata" src={preview} aria-label={filename}><track kind="captions" src={captions.startsWith("WEBVTT") ? captionUrl : undefined} srcLang="en" label="Captions" default /></video> : mime.startsWith("audio/") ? <audio onPlay={()=>setPlayback("Playback started")} onEnded={()=>setPlayback("Player reported an end event")} controls preload="metadata" src={preview} aria-label={filename} /> : mime.startsWith("image/") ? <Image unoptimized src={preview} alt={captions || filename} width={960} height={640} /> : <p>PDF preview is available by downloading the private file.</p>}
    <a className="button" href={url}>Download {filename}</a>{captions && <p className="nj-content-text">{captions}</p>}{transcript && <details><summary>Transcript</summary><p className="nj-content-text">{transcript}</p></details>}
    {!management && (mime.startsWith("video/") || mime.startsWith("audio/")) && <p role="status">{playback}. Unverified browser observation, not training completion.</p>}
  </section>;
}
