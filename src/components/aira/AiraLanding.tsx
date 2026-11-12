"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AiraNavigation } from "./AiraNavigation";
import { ScrollController, type ScrollHandle } from "./ScrollController";
import { VenturePortals } from "./VenturePortals";
import { airaDestinations, type Venture } from "./ventures";
import { roomOpacity, smoothstep } from "./journey";
import { SiaGuide } from "@/components/sia/sia-guide";
import { SkillCityLogo } from "@/components/skillcity-logo";
import { airaPublicLegalLinks } from "@/server/portals/aira-public-legal";
import "lenis/dist/lenis.css";
import "./aira.css";

function trackAiraJourney(event: "journey_view" | "skip_to_brands" | "portals_reached" | "brand_selected", brand?: Venture["id"]) {
  const body = JSON.stringify(brand ? { event, brand } : { event });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/aira-journey", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/analytics/aira-journey", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

const purposePillars = [
  { title: "Skills and learning", copy: "Build practical capability through learning that connects to real work.", accent: "#D4AF62" },
  { title: "Enterprise and innovation", copy: "A home for ideas, products and the work that makes them useful.", accent: "#B89552" },
  { title: "Careers and opportunity", copy: "A route into approved opportunity, with the terms clear before you commit.", accent: "#E8D5A5" }
] as const;

const SpaceScene = dynamic(() => import("./SpaceScene").then(module => module.SpaceScene), {
  ssr: false,
  loading: () => <div className="aira-loader">Entering the AIRA universe</div>
});

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

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
  const journeyFill = useRef<HTMLSpanElement>(null);
  const journeySteps = useRef<HTMLElement[]>([]);
  const journeyChapter = useRef(-1);
  const portalReached = useRef(false);
  const viewTracked = useRef(false);
  const overlay = useRef<HTMLDivElement>(null);
  const welcome = useRef<HTMLDivElement>(null);
  const innovation = useRef<HTMLDivElement>(null);
  const purpose = useRef<HTMLElement>(null);
  const painted = useRef(-1);
  const ventureCards = useRef<HTMLElement[]>([]);
  const portalTrails = useRef<SVGPathElement[]>([]);
  const [mobile, setMobile] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const [sceneSlow, setSceneSlow] = useState(false);

  const skipToBrands = useCallback(() => {
    trackAiraJourney("skip_to_brands");
    setSceneSlow(false);
    scroll.current?.skipToBrands();
  }, []);
  const selectBrand = useCallback((brand: Venture["id"]) => trackAiraJourney("brand_selected", brand), []);

  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    trackAiraJourney("journey_view");
  }, []);
  const markSceneReady = useCallback(() => {
    setSceneReady(true);
    setSceneSlow(false);
  }, []);
  const markSceneUnavailable = useCallback(() => {
    setSceneUnavailable(true);
    setSceneSlow(false);
  }, []);

  useEffect(() => {
    if (sceneReady || sceneUnavailable) return;
    const timeout = window.setTimeout(() => setSceneSlow(true), 2800);
    return () => window.clearTimeout(timeout);
  }, [sceneReady, sceneUnavailable]);

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
    if (journeyFill.current) journeyFill.current.style.transform = `scaleX(${reduced ? 0 : amount})`;
    const chapter = amount < 0.66 ? 0 : amount < 0.875 ? 1 : amount < 0.955 ? 2 : 3;
    if (chapter !== journeyChapter.current) {
      journeyChapter.current = chapter;
      journeySteps.current.forEach((step, index) => {
        if (index === chapter) step.setAttribute("aria-current", "step");
        else step.removeAttribute("aria-current");
        step.dataset.state = index < chapter ? "complete" : index === chapter ? "current" : "upcoming";
      });
    }
    const showRoom = (node: HTMLDivElement | null, room: "welcome" | "innovation") => {
      if (!node) return;
      const shown = reduced ? 0 : roomOpacity(amount, room);
      node.style.opacity = String(shown);
      node.style.transform = `translate(-50%, calc(-50% + ${(1 - shown) * 18}px))`;
    };
    showRoom(welcome.current, "welcome");
    showRoom(innovation.current, "innovation");
    const portal = smoothstep(0.955, 1, amount);
    if (portal >= 0.12 && !portalReached.current) {
      portalReached.current = true;
      trackAiraJourney("portals_reached");
    }
    if (overlay.current) {
      overlay.current.style.opacity = !reduced && portal > 0 ? "1" : "0";
    }
    if (overlay.current && ventureCards.current.length === 0) {
      ventureCards.current = [...overlay.current.querySelectorAll<HTMLElement>("[data-venture-card]")];
      portalTrails.current = [...overlay.current.querySelectorAll<SVGPathElement>("[data-venture-trail]")];
    }
    ventureCards.current.forEach((card, index) => {
      const local = smoothstep(0.08 + index * 0.29, 0.4 + index * 0.29, portal);
      const interactive = !reduced && local >= 0.12;
      card.style.opacity = String(local);
      card.style.translate = `0 ${14 * (1 - local)}px`;
      card.style.pointerEvents = interactive ? "auto" : "none";
      if (!interactive && document.activeElement === card) card.blur();
      card.tabIndex = interactive ? 0 : -1;
      card.setAttribute("aria-hidden", String(!interactive));
      card.inert = !interactive;
      const trail = portalTrails.current[index];
      if (trail) trail.style.strokeDashoffset = String(1 - local);
    });
  }, [reduced]);

  useLayoutEffect(() => {
    const section = purpose.current;
    if (!section) return;
    const grid = section.querySelector<HTMLElement>(".aira-purpose-grid");
    const cards = [...section.querySelectorAll<HTMLElement>(".aira-purpose-grid article")];
    if (!grid || cards.length < 2) return;
    const clear = () => cards.forEach(card => { card.style.transform = ""; });
    if (reduced) {
      section.classList.add("is-shown");
      section.classList.add("is-settled");
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
      const step = gap + width * 0.22;
      const centerOffset = ((cards.length - 1) * step * (1 - spread)) / 2;
      cards.forEach((card, index) => {
        const travel = index * step * (1 - spread) - centerOffset;
        card.style.transform = `translate3d(${-travel}px, 0, 0)`;
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
      <AiraNavigation home={home} login={login} onExplore={() => scroll.current?.explore()} onSkipToBrands={skipToBrands} />
      <ScrollController ref={scroll} progress={progress} mobile={mobile} reduced={reduced} onProgress={paint}>
        <SceneErrorBoundary onError={markSceneUnavailable} fallback={<div className="aira-scene-fallback aira-scene-error" role="status"><p>The 3D scene could not be loaded.</p><button type="button" onClick={skipToBrands}>Explore the brand choices</button></div>}>
          <SpaceScene progress={progress} mobile={mobile} shadows={!mobile && !reduced} onReady={markSceneReady} onUnavailable={markSceneUnavailable} onSkip={skipToBrands} />
        </SceneErrorBoundary>
        {sceneSlow && !sceneReady && !sceneUnavailable && <div className="aira-loader-action" role="status"><span>The AIRA scene is taking a while.</span><button type="button" onClick={skipToBrands}>Explore the brand choices</button></div>}
        <nav className="aira-journey-progress" aria-label="AIRA journey chapters">
          <div className="aira-journey-track" aria-hidden="true"><span ref={journeyFill} /></div>
          <ol>
            {["AIRA Universe", "Welcome", "Innovation", "Choose your path"].map((label, index) => (
              <li key={label} ref={node => { if (node) journeySteps.current[index] = node; }} data-state={index === 0 ? "current" : "upcoming"} aria-current={index === 0 ? "step" : undefined}>{label}</li>
            ))}
          </ol>
        </nav>
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
        <p className="aira-sr">Scroll from space to the AIRA headquarters, enter the welcome room, continue into the innovation room, then choose Startup Skool, AIRA Labs, or Nice Jobs.</p>
        <div className="aira-room" ref={welcome}>
          <p>AIRA SKILL CITY</p>
          <h2>Welcome to<br />Aira Skill City</h2>
        </div>
        <div className="aira-room aira-room-innovation" ref={innovation}>
          <p>AIRA</p>
          <h2>Future of<br />innovation</h2>
        </div>
        <VenturePortals ref={overlay} variant="overlay" ventures={ventures} onBrandSelect={selectBrand} />
      </ScrollController>
      <VenturePortals variant="flow" ventures={ventures} onBrandSelect={selectBrand} />
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
          <SkillCityLogo size={72} />
          <nav aria-label="AIRA">
            <a href="#faq">About</a>
            <a href={contact}>Contact</a>
            {airaPublicLegalLinks.filter(link => link.href !== "/contact").map(link => (
              <a key={link.href} href={home === "/" ? link.href : `${home}${link.href}`}>{link.label}</a>
            ))}
            {airaDestinations.social.map(link => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            ))}
          </nav>
        </footer>
      </section>
      <SiaGuide message="Welcome to AIRA Skill City. Explore our brands and practical learning paths here. A person will help with any formal decision." action={{ href: login, label: "Open your Skill City sign-in" }} disclaimer="This is page guidance. Access and decisions follow the existing human review steps." />
    </main>
  );
}
