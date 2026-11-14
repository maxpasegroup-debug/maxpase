"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";
import styles from "./landing.module.css";

type Introduction = { languageCode: string; languageName: string; title: string; mediaType: "AUDIO" | "VIDEO"; durationSeconds: number; hasThumbnail: boolean; mediaUrl: string; thumbnailUrl: string };
type PublicLanguage = { languageCode: string; languageName: string };
type SessionResponse = { durationSeconds: number; error?: string };
const languageChoices = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "ml", nativeName: "മലയാളം", englishName: "Malayalam" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { code: "kn", nativeName: "ಕನ್ನಡ", englishName: "Kannada" },
];
const apiBase = (signup: string) => signup.startsWith("/sites/jobs") ? "/sites/jobs" : "";

function languageLabel(language: PublicLanguage) {
  const code = language.languageCode.toLowerCase().split("-")[0];
  const standard = languageChoices.find(item => item.code === code);
  return standard ?? { code: language.languageCode.toLowerCase(), nativeName: language.languageName, englishName: language.languageName };
}

export function StartNow({ signup }: { signup: string }) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), audio = useRef<HTMLAudioElement>(null), lastTime = useRef(0), sessionOpen = useRef(false);
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false), [loading, setLoading] = useState(false), [items, setItems] = useState<Introduction[]>([]), [languages, setLanguages] = useState<PublicLanguage[]>([]), [selectedLanguage, setSelectedLanguage] = useState(""), [active, setActive] = useState<Introduction | null>(null), [duration, setDuration] = useState(0), [position, setPosition] = useState(0), [playing, setPlaying] = useState(false), [complete, setComplete] = useState(false), [error, setError] = useState("");
  const base = apiBase(signup);
  const currentMedia = () => active?.mediaType === "VIDEO" ? video.current : audio.current;
  const configuredLanguages = new Map<string, PublicLanguage>();
  for (const language of languageChoices.slice(0, 4)) configuredLanguages.set(language.code, { languageCode: language.code, languageName: language.englishName });
  for (const language of languages) configuredLanguages.set(language.languageCode.toLowerCase(), language);
  for (const item of items) configuredLanguages.set(item.languageCode.toLowerCase(), { languageCode: item.languageCode, languageName: item.languageName });
  const displayLanguages = [...configuredLanguages.values()]
    .map(language => ({ ...languageLabel(language), languageCode: language.languageCode }))
    .sort((a, b) => {
      const order = (code: string) => { const index = languageChoices.findIndex(item => item.code === code); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
      return order(a.code) - order(b.code) || a.englishName.localeCompare(b.englishName);
    });
  async function report(status: "PLAYING" | "PAUSED" | "ENDED" | "ABANDONED", position = currentMedia()?.currentTime ?? 0) {
    const response = await fetch(`${base}/intro-session`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, position }) });
    return response.json() as Promise<{ complete?: boolean; error?: string }>;
  }
  async function open() {
    setItems([]); setLanguages([]); setSelectedLanguage(""); setActive(null); setComplete(false); setError(""); setLoading(true); setIsOpen(true); lastTime.current = 0;
    dialog.current?.showModal();
    try {
      const response = await fetch(`${base}/intro-media`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as { items: Omit<Introduction, "mediaUrl" | "thumbnailUrl">[]; languages: PublicLanguage[] };
      setLanguages(data.languages);
      setItems(data.items.map(item => ({ ...item, mediaUrl: `${base}/intro-media/${encodeURIComponent(item.languageCode)}/media`, thumbnailUrl: item.hasThumbnail ? `${base}/intro-media/${encodeURIComponent(item.languageCode)}/thumbnail` : "/images/nice-jobs-hero-v2.webp" })));
    } catch { setError("Language choices are temporarily unavailable. Please try again."); }
    finally { setLoading(false); }
  }
  function close() {
    const media = currentMedia(); media?.pause();
    if (media) media.currentTime = 0;
    if (sessionOpen.current) { void report("ABANDONED", 0); sessionOpen.current = false; }
    setComplete(false); setPlaying(false); setActive(null); setSelectedLanguage(""); setIsOpen(false); lastTime.current = 0; dialog.current?.close();
  }
  async function choose(item: Introduction) {
    setError(""); setLoading(true);
    try {
      const response = await fetch(`${base}/intro-session`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ languageCode: item.languageCode }) });
      const session = await response.json() as SessionResponse;
      if (!response.ok) throw new Error(session.error ?? "This introduction is unavailable.");
      sessionOpen.current = true; lastTime.current = 0; setPosition(0); setDuration(session.durationSeconds); setComplete(false); setActive(item);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the introduction. Try again."); }
    finally { setLoading(false); }
  }
  async function continueToIntroduction() {
    const item = items.find(introduction => introduction.languageCode.toLowerCase() === selectedLanguage.toLowerCase());
    if (item) await choose(item);
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
    <dialog ref={dialog} className={styles.introDialog} aria-labelledby={titleId} onClose={() => { const media = currentMedia(); media?.pause(); if (sessionOpen.current) { void report("ABANDONED", 0); sessionOpen.current = false; } setComplete(false); setPlaying(false); setActive(null); setSelectedLanguage(""); setIsOpen(false); lastTime.current = 0; }}>
      <header className={styles.introDialogHeader}>
        <div>
          <p className={styles.introJourneyLabel}>NICEJOBS <span>·</span> YOUR JOURNEY</p>
          <p className={styles.introStepLabel}>INTRODUCTION</p>
          <h2 id={titleId}>{active ? active.languageName : "Let's get started."}</h2>
        </div>
        <button type="button" aria-label="Close introduction" onClick={close}><X size={20}/></button>
      </header>
      {loading && <p className={styles.videoHint} role="status">Loading introduction…</p>}
      {!loading && !active && <>
        <p className={styles.introLead}>Choose your preferred language to discover how NICEJOBS works.</p>
        <div className={styles.introLanguageTitle}><span>Choose your language</span><small>Published introductions only</small></div>
        <div className={styles.introLanguageGrid}>
          {displayLanguages.map(language => {
            const item = items.find(introduction => introduction.languageCode.toLowerCase() === language.languageCode.toLowerCase());
            const selected = selectedLanguage.toLowerCase() === language.languageCode.toLowerCase();
            return <button className={`${styles.introLanguage} ${!item ? styles.introLanguageUnavailable : ""} ${selected ? styles.introLanguageSelected : ""}`} type="button" key={language.languageCode} disabled={!item} aria-pressed={selected} onClick={() => { setSelectedLanguage(language.languageCode); setError(""); }}>
              <span className={styles.introLanguageName}>{language.nativeName}</span>
              {language.englishName !== language.nativeName && <span className={styles.introLanguageEnglish}>{language.englishName}</span>}
              <small>{item ? `${item.mediaType === "AUDIO" ? "Audio" : "Video"} introduction` : "Coming soon"}</small>
            </button>;
          })}
        </div>
        {!items.length && !error && <p className={styles.introUnavailableMessage} role="status">We're preparing your NICEJOBS introduction. Please check back soon.</p>}
        {error && <p className={styles.videoError} role="alert">{error}</p>}
        <div className={styles.introContinueRow}>
          <button type="button" className={styles.introContinue} onClick={() => void continueToIntroduction()} disabled={!selectedLanguage || loading}>
            Continue to Introduction <ArrowRight size={18}/>
          </button>
          {!selectedLanguage && <small>Available after selecting a published language</small>}
        </div>
      </>}
      {!loading && active && <>
        <div className={styles.introMediaHeading}><button type="button" className={styles.introBack} onClick={() => { currentMedia()?.pause(); void report("ABANDONED", 0); sessionOpen.current = false; setActive(null); setPlaying(false); setComplete(false); }} aria-label="Choose another language"><ArrowLeft size={17}/> Languages</button><p>{active.mediaType === "AUDIO" ? "Introduction to NICEJOBS" : active.title}</p></div>
        {active.mediaType === "VIDEO" ? <video ref={video} key={active.mediaUrl} src={active.mediaUrl} playsInline preload="metadata" aria-label={active.title} onLoadedMetadata={e => setDuration(e.currentTarget.duration || duration)} onTimeUpdate={e => { if (!e.currentTarget.seeking) { lastTime.current = e.currentTarget.currentTime; setPosition(e.currentTarget.currentTime); } }} onSeeking={keepPlaybackInOrder} onRateChange={e => { if (e.currentTarget.playbackRate !== 1) e.currentTarget.playbackRate = 1; }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError("This video could not be loaded. Check your connection and try again.")} onEnded={() => void finish()} /> : <><Image className={styles.introAudioThumb} src={active.thumbnailUrl} alt="" width={960} height={540} unoptimized /><audio ref={audio} key={active.mediaUrl} src={active.mediaUrl} preload="metadata" aria-label={active.title} onLoadedMetadata={e => setDuration(e.currentTarget.duration || duration)} onTimeUpdate={e => { if (!e.currentTarget.seeking) { lastTime.current = e.currentTarget.currentTime; setPosition(e.currentTarget.currentTime); } }} onSeeking={keepPlaybackInOrder} onRateChange={e => { if (e.currentTarget.playbackRate !== 1) e.currentTarget.playbackRate = 1; }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError("This audio could not be loaded. Check your connection and try again.")} onEnded={() => void finish()} /></>}
        <div className={styles.introProgress}><progress max={duration || active.durationSeconds} value={position} aria-label="Introduction playback progress"/><span>{Math.min(Math.floor(position), duration || active.durationSeconds)}s / {Math.round(duration || active.durationSeconds)}s</span></div>
        {!complete && <button type="button" className={styles.videoToggle} onClick={() => void togglePlayback()}>{playing ? <Pause size={18}/> : <Play size={18}/>} {playing ? "Pause" : "Play"}</button>}
        {complete ? <Link className={styles.introContinue} href={signup}>Continue <ArrowRight size={19}/></Link> : <p className={styles.videoHint}>Listen or watch to the end to continue.</p>}
      </>}
    </dialog>
  </>;
}
