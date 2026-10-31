"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AiraNavigation } from "./AiraNavigation";
import { ScrollController, type ScrollHandle } from "./ScrollController";
import { VenturePortals } from "./VenturePortals";
import { airaDestinations, type Venture } from "./ventures";
import { roomOpacity, smoothstep } from "./journey";
import "lenis/dist/lenis.css";
import "./aira.css";

const purposePillars = [
  { title: "Skills and learning", copy: "Build practical capability through learning that connects to real work.", accent: "#e7b15a" },
  { title: "Enterprise and innovation", copy: "A home for ideas, products and the work that makes them useful.", accent: "#49d6ff" },
  { title: "Careers and opportunity", copy: "A route into approved opportunity, with the terms clear before you commit.", accent: "#8aa6ff" }
] as const;

const SpaceScene = dynamic(() => import("./SpaceScene").then(module => module.SpaceScene), {
  ssr: false,
  loading: () => <div className="aira-loader">Entering the AIRA universe</div>
});

export function AiraLanding({
  home,
  login,
  ventures,
  contact,
  faqs
}: {
  home: string;
  login: string;
  ventures: Venture[];
  contact: string;
  faqs: ReadonlyArray<readonly [string, string]>;
}) {
  const progress = useRef({ t: 0 });
  const scroll = useRef<ScrollHandle>(null);
  const hero = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const welcome = useRef<HTMLDivElement>(null);
  const innovation = useRef<HTMLDivElement>(null);
  const purpose = useRef<HTMLElement>(null);
  const painted = useRef(-1);
  const ventureCards = useRef<HTMLElement[]>([]);
  const [mobile, setMobile] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setMobile(mobileQuery.matches);
      setReduced(motionQuery.matches);
    };
    sync();
    mobileQuery.addEventListener("change", sync);
    motionQuery.addEventListener("change", sync);
    return () => {
      mobileQuery.removeEventListener("change", sync);
      motionQuery.removeEventListener("change", sync);
    };
  }, []);

  const paint = useCallback((amount: number) => {
    const key = Math.round(amount * 800) / 800;
    if (key === painted.current) return;
    painted.current = key;
    if (hero.current) {
      const opacity = reduced ? 1 : 1 - smoothstep(0.06, 0.24, amount);
      hero.current.style.opacity = String(opacity);
      hero.current.style.transform = `translateY(calc(-50% - ${reduced ? 0 : amount * 48}px))`;
    }
    if (hint.current) hint.current.style.opacity = reduced ? "0" : String(1 - smoothstep(0.02, 0.12, amount));
    const showRoom = (node: HTMLDivElement | null, room: "welcome" | "innovation") => {
      if (!node) return;
      const shown = reduced ? 0 : roomOpacity(amount, room);
      node.style.opacity = String(shown);
      node.style.transform = `translate(-50%, calc(-50% + ${(1 - shown) * 18}px))`;
    };
    showRoom(welcome.current, "welcome");
    showRoom(innovation.current, "innovation");
    const portal = smoothstep(0.955, 1, amount);
    if (overlay.current) {
      overlay.current.style.opacity = reduced ? "0" : String(portal);
      overlay.current.style.pointerEvents = !reduced && portal > 0.7 ? "auto" : "none";
    }
    if (overlay.current && ventureCards.current.length === 0) {
      ventureCards.current = [...overlay.current.querySelectorAll<HTMLElement>("[data-venture-card]")];
    }
    ventureCards.current.forEach((card, index) => {
      const local = smoothstep(0.04 + index * 0.16, 0.46 + index * 0.14, portal);
      card.style.opacity = String(local);
    });
  }, [reduced]);

  useLayoutEffect(() => {
    const section = purpose.current;
    if (!section) return;
    const grid = section.querySelector<HTMLElement>(".aira-purpose-grid");
    const cards = [...section.querySelectorAll<HTMLElement>(".aira-purpose-grid article")];
    if (!grid || cards.length < 2) return;
    const copy = (card: HTMLElement) => card.querySelectorAll<HTMLElement>("h3, p, .aira-purpose-index");
    const clear = () => cards.forEach(card => {
      card.style.transform = "";
      copy(card).forEach(node => { node.style.opacity = ""; });
    });
    if (reduced) {
      section.classList.add("is-shown");
      clear();
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const place = (spread: number) => {
      const narrow = window.matchMedia("(max-width: 760px)").matches;
      const settled = narrow || spread >= 0.999;
      section.classList.toggle("is-shown", settled || spread > 0.04);
      section.classList.toggle("is-settled", settled);
      if (settled) {
        clear();
        return;
      }
      const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
      const width = cards[0].getBoundingClientRect().width;
      const peek = 28;
      cards.forEach((card, index) => {
        const travel = index * (width + gap - peek) * (1 - spread);
        const revealed = index === cards.length - 1 ? 1 : Math.min(1, Math.max(0, (spread - 0.12) / 0.4));
        card.style.transform = `translate3d(${-travel}px, 0, 0)`;
        copy(card).forEach(node => { node.style.opacity = String(revealed); });
      });
    };
    const trigger = ScrollTrigger.create({
      trigger: grid,
      start: "top 68%",
      end: "top 24%",
      scrub: 0.4,
      onUpdate: self => place(self.progress)
    });
    place(trigger.progress);
    const onResize = () => {
      ScrollTrigger.refresh();
      place(trigger.progress);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      trigger.kill();
      clear();
    };
  }, [reduced]);

  return (
    <main className={`aira-root${reduced ? " is-reduced" : ""}`}>
      <AiraNavigation home={home} login={login} onExplore={() => scroll.current?.explore()} />
      <ScrollController ref={scroll} progress={progress} mobile={mobile} reduced={reduced} onProgress={paint}>
        <SpaceScene progress={progress} mobile={mobile} shadows={!mobile && !reduced} />
        <div className="aira-hero" ref={hero}>
          <p className="aira-brand">AIRA</p>
          <h1>BEYOND THE<br />ORDINARY.</h1>
          <p className="aira-support">One ecosystem. Infinite possibilities.</p>
          <ul className="aira-labels">
            <li>EXPLORING THE FUTURE</li>
            <li>EST. INNOVATION</li>
            <li>ENTER THE AIRA UNIVERSE</li>
          </ul>
        </div>
        <p className="aira-hint" ref={hint}><span />SCROLL TO EXPLORE</p>
        <p className="aira-sr">Scroll from space to the AIRA headquarters, enter the welcome room, continue into the innovation room, then choose Startup School, AIRA Labs, or Nice Jobs.</p>
        <div className="aira-room" ref={welcome}>
          <p>AIRA SKILL CITY</p>
          <h2>Welcome to<br />Aira Skill City</h2>
        </div>
        <div className="aira-room aira-room-innovation" ref={innovation}>
          <p>AIRA</p>
          <h2>Future of<br />innovation</h2>
        </div>
        <VenturePortals ref={overlay} variant="overlay" ventures={ventures} />
      </ScrollController>
      <VenturePortals variant="flow" ventures={ventures} />
      <section className="aira-purpose" id="purpose" ref={purpose} aria-labelledby="aira-purpose-title">
        <div className="aira-purpose-head">
          <p>MOVE FORWARD WITH PURPOSE</p>
          <h2 id="aira-purpose-title">Your skills. Your next step.</h2>
        </div>
        <div className="aira-purpose-grid">
          {purposePillars.map((pillar, index) => (
            <article key={pillar.title} style={{ "--accent": pillar.accent } as CSSProperties}>
              <span className="aira-purpose-badge">{index + 1}</span>
              <span className="aira-purpose-index">0{index + 1}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="aira-finale" aria-labelledby="aira-finale-title">
        <p className="aira-brand">AIRA</p>
        <h2 id="aira-finale-title">YOUR NEXT CHAPTER STARTS HERE.</h2>
        <p>Explore the possibilities within the AIRA universe.</p>
        <a className="aira-discover" href={login}>DISCOVER AIRA</a>
        <section className="aira-faq" id="faq" aria-labelledby="skillcity-faq-title">
          <h2 id="skillcity-faq-title">Questions about AIRA Skill City.</h2>
          <div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        </section>
        <footer className="aira-footer">
          <strong>AIRA</strong>
          <nav aria-label="AIRA">
            <a href="#faq">About</a>
            <a href={contact}>Contact</a>
            {airaDestinations.social.map(link => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            ))}
          </nav>
        </footer>
      </section>
    </main>
  );
}
