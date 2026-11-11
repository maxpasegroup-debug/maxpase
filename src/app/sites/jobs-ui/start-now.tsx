"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pause, Play, X } from "lucide-react";
import styles from "./landing.module.css";

export function StartNow({ signup, title, videoUrl }: { signup: string; title: string; videoUrl: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), lastTime = useRef(0);
  const titleId = useId();
  const [complete, setComplete] = useState(false), [paused, setPaused] = useState(false), [isOpen, setIsOpen] = useState(false);
  function open() { setComplete(false); setPaused(false); setIsOpen(true); lastTime.current = 0; dialog.current?.showModal(); }
  function close() { video.current?.pause(); if (video.current) video.current.currentTime = 0; setComplete(false); setPaused(false); setIsOpen(false); lastTime.current = 0; dialog.current?.close(); }
  useEffect(() => {
    const element = video.current;
    if (!isOpen || !dialog.current?.open || !element || !videoUrl) return;
    element.currentTime = 0;
    void element.play().catch(() => setPaused(true));
  }, [isOpen, videoUrl]);
  return <>
    <button type="button" className={styles.primaryButton} onClick={open}>Start Now <ArrowRight size={19}/></button>
    <dialog ref={dialog} className={styles.introDialog} aria-labelledby={titleId} onClose={() => { video.current?.pause(); setComplete(false); setPaused(false); setIsOpen(false); lastTime.current = 0; }}>
      <header><div><p className={styles.eyebrow}>NICEJOBS INTRODUCTION</p><h2 id={titleId}>{title}</h2></div><button type="button" aria-label="Close introduction" onClick={close}><X size={20}/></button></header>
      {videoUrl ? <>
        <video ref={video} src={videoUrl} playsInline preload="auto" aria-label={title}
          onTimeUpdate={event => { if (!event.currentTarget.seeking) lastTime.current = event.currentTarget.currentTime; }}
          onSeeking={event => { const element = event.currentTarget; if (!complete && Math.abs(element.currentTime - lastTime.current) > 0.75) element.currentTime = lastTime.current; }}
          onRateChange={event => { if (event.currentTarget.playbackRate !== 1) event.currentTarget.playbackRate = 1; }}
          onEnded={() => setComplete(true)} />
        {!complete && <button type="button" className={styles.videoToggle} onClick={() => { const element = video.current; if (!element) return; if (element.paused) { void element.play(); setPaused(false); } else { element.pause(); setPaused(true); } }}>{paused ? <Play size={18}/> : <Pause size={18}/>} {paused ? "Play" : "Pause"}</button>}
        {complete ? <Link className={styles.introContinue} href={signup}>Continue <ArrowRight size={19}/></Link> : <p className={styles.videoHint}>Watch to the end to continue.</p>}
      </> : <p className={styles.videoHint} role="status">The introduction video is not available yet. Please check back soon.</p>}
    </dialog>
  </>;
}
