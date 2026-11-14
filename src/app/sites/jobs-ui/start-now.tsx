"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";
import styles from "./landing.module.css";

type Introduction = { languageCode: string; languageName: string; title: string; mediaType: "AUDIO" | "VIDEO"; durationSeconds: number; hasThumbnail: boolean; mediaUrl: string; thumbnailUrl: string };
type SessionResponse = { durationSeconds: number; error?: string };
const languageChoices = [
  { code: "en", name: "English", glyph: "EN" },
  { code: "ml", name: "Malayalam", glyph: "മ" },
  { code: "ta", name: "Tamil", glyph: "த" },
  { code: "hi", name: "Hindi", glyph: "हि" },
];
const apiBase = (signup: string) => signup.startsWith("/sites/jobs") ? "/sites/jobs" : "";

export function StartNow({ signup }: { signup: string }) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), audio = useRef<HTMLAudioElement>(null), lastTime = useRef(0), sessionOpen = useRef(false);
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false), [loading, setLoading] = useState(false), [items, setItems] = useState<Introduction[]>([]), [active, setActive] = useState<Introduction | null>(null), [unavailableLanguage, setUnavailableLanguage] = useState(""), [duration, setDuration] = useState(0), [position, setPosition] = useState(0), [playing, setPlaying] = useState(false), [complete, setComplete] = useState(false), [error, setError] = useState("");
  const base = apiBase(signup);
  const currentMedia = () => active?.mediaType === "VIDEO" ? video.current : audio.current;
  async function report(status: "PLAYING" | "PAUSED" | "ENDED" | "ABANDONED", position = currentMedia()?.currentTime ?? 0) {
    const response = await fetch(`${base}/intro-session`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, position }) });
    return response.json() as Promise<{ complete?: boolean; error?: string }>;
  }
  async function open() {
    setItems([]); setActive(null); setUnavailableLanguage(""); setComplete(false); setError(""); setLoading(true); setIsOpen(true); lastTime.current = 0;
    dialog.current?.showModal();
    try { const response = await fetch(`${base}/intro-media`, { cache: "no-store" }); if (!response.ok) throw new Error(); const published = await response.json() as Omit<Introduction, "mediaUrl" | "thumbnailUrl">[]; setItems(published.map(item => ({ ...item, mediaUrl: `${base}/intro-media/${encodeURIComponent(item.languageCode)}/media`, thumbnailUrl: item.hasThumbnail ? `${base}/intro-media/${encodeURIComponent(item.languageCode)}/thumbnail` : "/images/nice-jobs-hero-v2.webp" }))); }
    catch { setError("Language choices are temporarily unavailable. Please try again."); }
    finally { setLoading(false); }
  }
  function close() {
    const media = currentMedia(); media?.pause();
    if (media) media.currentTime = 0;
    if (sessionOpen.current) { void report("ABANDONED", 0); sessionOpen.current = false; }
    setComplete(false); setPlaying(false); setActive(null); setUnavailableLanguage(""); setIsOpen(false); lastTime.current = 0; dialog.current?.close();
  }
  async function choose(item: Introduction) {
    setError(""); setUnavailableLanguage(""); setLoading(true);
    try {
      const response = await fetch(`${base}/intro-session`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ languageCode: item.languageCode }) });
      const session = await response.json() as SessionResponse;
      if (!response.ok) throw new Error(session.error ?? "This introduction is unavailable.");
      sessionOpen.current = true; lastTime.current = 0; setPosition(0); setDuration(session.durationSeconds); setComplete(false); setActive(item);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the introduction. Try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!active || complete || !isOpen) return;
    const element = currentMedia();
    if (!element) return;
    element.currentTime = 0;
    const timer = window.setInterval(() => {
      if (element && !element.paused && !element.ended) void report("PLAYING", element.currentTime).catch(() => setError("Connection interrupted. Keep this introduction open and retry playback."));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [active, complete, isOpen, duration]);
  async function togglePlayback() {
    const element = currentMedia(); if (!element) return;
    if (element.paused) {
      try { await report("PLAYING", element.currentTime); await element.play(); setPlaying(true); setError(""); }
      catch { setPlaying(false); setError("Playback could not start. Check your connection and press Play again."); }
    } else { element.pause(); setPlaying(false); void report("PAUSED", element.currentTime); }
  }
  function keepPlaybackInOrder(event: React.SyntheticEvent<HTMLMediaElement>) {
    const element = event.currentTarget;
    if (!complete && Math.abs(element.currentTime - lastTime.current) > 0.8) element.currentTime = lastTime.current;
  }
  async function finish() {
    setPlaying(false);
    try { const result = await report("ENDED", duration || currentMedia()?.currentTime || 0); if (result.complete) { setComplete(true); sessionOpen.current = false; } else setError(result.error ?? "The introduction was not fully verified. Replay it to continue."); }
    catch { setError("Completion could not be verified. Please replay the introduction."); }
  }
  return <>
    <button type="button" className={styles.primaryButton} onClick={() => void open()}>Start Now <ArrowRight size={19}/></button>
    <dialog ref={dialog} className={styles.introDialog} aria-labelledby={titleId} onClose={() => { const media = currentMedia(); media?.pause(); if (sessionOpen.current) { void report("ABANDONED", 0); sessionOpen.current = false; } setComplete(false); setPlaying(false); setActive(null); setUnavailableLanguage(""); setIsOpen(false); lastTime.current = 0; }}>
      <header><div><p className={styles.eyebrow}>NICEJOBS INTRODUCTION</p><h2 id={titleId}>{active ? active.languageName : "Choose Your Language"}</h2></div><button type="button" aria-label="Close introduction" onClick={close}><X size={20}/></button></header>
      {loading && <p className={styles.videoHint} role="status">Loading introduction…</p>}
      {!loading && !active && <>
        <p className={styles.videoHint}>Choose a language to hear or watch our introduction.</p>
        <div className={styles.introLanguageGrid}>
          {languageChoices.map(language => {
            const item = items.find(introduction => introduction.languageCode.toLowerCase() === language.code);
            return item
              ? <button className={styles.introLanguage} type="button" key={language.code} onClick={() => void choose(item)}><Image src={item.thumbnailUrl} alt="" width={480} height={270} unoptimized /><span>{language.name}</span><small>{item.mediaType === "AUDIO" ? "Audio introduction" : "Video introduction"}</small></button>
              : <button className={`${styles.introLanguage} ${styles.introLanguageUnavailable} ${unavailableLanguage === language.name ? styles.introLanguageSelected : ""}`} type="button" key={language.code} aria-pressed={unavailableLanguage === language.name} aria-label={`${language.name}: ${error ? "temporarily unavailable" : "introduction coming soon"}`} onClick={() => setUnavailableLanguage(language.name)}><span className={styles.languagePlaceholder} aria-hidden="true">{language.glyph}</span><span>{language.name}</span><small>{error ? "Temporarily unavailable" : "Introduction coming soon"}</small></button>;
          })}
        </div>
        {unavailableLanguage && <p className={styles.videoHint} role="status">{error ? "We could not check this introduction right now. Please try again later." : `${unavailableLanguage} introduction is being prepared. It will be available here after publication.`}</p>}
        {!items.length && !error && !unavailableLanguage && <p className={styles.videoHint} role="status">A language introduction becomes available here once it is published.</p>}
      </>}
      {!loading && active && <>
        <div className={styles.introMediaHeading}><button type="button" className={styles.introBack} onClick={() => { currentMedia()?.pause(); void report("ABANDONED", 0); sessionOpen.current = false; setActive(null); setUnavailableLanguage(""); setPlaying(false); setComplete(false); }} aria-label="Choose another language"><ArrowLeft size={17}/> Languages</button><p>{active.mediaType === "AUDIO" ? "Introduction to NICEJOBS" : active.title}</p></div>
        {active.mediaType === "VIDEO" ? <video ref={video} key={active.mediaUrl} src={active.mediaUrl} playsInline preload="metadata" aria-label={active.title} onLoadedMetadata={e => setDuration(e.currentTarget.duration || duration)} onTimeUpdate={e => { if (!e.currentTarget.seeking) { lastTime.current = e.currentTarget.currentTime; setPosition(e.currentTarget.currentTime); } }} onSeeking={keepPlaybackInOrder} onRateChange={e => { if (e.currentTarget.playbackRate !== 1) e.currentTarget.playbackRate = 1; }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError("This video could not be loaded. Check your connection and try again.")} onEnded={() => void finish()} /> : <><Image className={styles.introAudioThumb} src={active.thumbnailUrl} alt="" width={960} height={540} unoptimized /><audio ref={audio} key={active.mediaUrl} src={active.mediaUrl} preload="metadata" aria-label={active.title} onLoadedMetadata={e => setDuration(e.currentTarget.duration || duration)} onTimeUpdate={e => { if (!e.currentTarget.seeking) { lastTime.current = e.currentTarget.currentTime; setPosition(e.currentTarget.currentTime); } }} onSeeking={keepPlaybackInOrder} onRateChange={e => { if (e.currentTarget.playbackRate !== 1) e.currentTarget.playbackRate = 1; }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError("This audio could not be loaded. Check your connection and try again.")} onEnded={() => void finish()} /></>}
        <div className={styles.introProgress}><progress max={duration || active.durationSeconds} value={position} aria-label="Introduction playback progress"/><span>{Math.min(Math.floor(position), duration || active.durationSeconds)}s / {Math.round(duration || active.durationSeconds)}s</span></div>
        {!complete && <button type="button" className={styles.videoToggle} onClick={() => void togglePlayback()}>{playing ? <Pause size={18}/> : <Play size={18}/>} {playing ? "Pause" : "Play"}</button>}
        {complete ? <Link className={styles.introContinue} href={signup}>Continue <ArrowRight size={19}/></Link> : <p className={styles.videoHint}>Listen or watch to the end to continue.</p>}
      </>}
      {error && <p className={styles.videoError} role="alert">{error}</p>}
    </dialog>
  </>;
}
