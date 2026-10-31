"use client";

import Link from "next/link";
import Image from "next/image";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Instrument_Sans } from "next/font/google";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./startup.css";
import { StartupSiaAssistant } from "./sia-assistant";

const sans = Instrument_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"]
});

const nav = [
  ["Discover", "discover"],
  ["Learn", "learn"],
  ["Build", "build"],
  ["Launch", "launch"],
  ["About", "about"]
] as const;

const discoverSteps = [
  ["Find a problem", "Notice a situation people already work around. The school is a place to practise that attention. It does not promise a company."],
  ["Explore opportunities", "Compare a few directions through entrepreneurship, practical learning, and founder projects."],
  ["Shape your idea", "Write the idea down and choose a next step. This page does not create an account or a project."]
] as const;

const themes = [
  ["Entrepreneurship fundamentals", "How a founder looks at a problem before naming a product.", "#ff6b4a"],
  ["Business strategy", "Choices about who the work is for, and what it is not.", "#7c5cff"],
  ["Design thinking", "Sketch a response before anything is built.", "#14c8b8"],
  ["Market research", "Listen before assuming there is a customer.", "#f2c14e"],
  ["Financial fundamentals", "Read the shape of a simple model. This is not a funding offer.", "#ff8fab"],
  ["Digital product development", "Turn a sketch into something people can try.", "#69a7ff"]
] as const;

const stages = [
  ["Idea", "A sentence you can explain."],
  ["Research", "What you still need to learn."],
  ["Design", "A sketch of the experience."],
  ["Build", "A first version you can show."],
  ["Test", "A conversation with a real person."],
  ["Product", "Something people can look at. Not a launched company."]
] as const;

const focusCopy: Record<string, string> = {
  Entrepreneurship: "Explore opportunities and think like a founder.",
  "Practical learning": "Learn by doing with practical, applied work.",
  "Founder projects": "Turn ambition into focused founder projects."
};

const brands = [
  ["Skill City", "https://airaskillcity.com"],
  ["Labs", "https://airalabs.online"],
  ["Nice Jobs", "https://nicejobs.online"]
] as const;

export function StartupLanding({
  home,
  login,
  signup,
  name,
  description,
  ecosystem,
  focus,
  faqs
}: {
  home: string;
  login: string;
  signup: string;
  name: string;
  description: string;
  image: string;
  ecosystem: string;
  focus: readonly string[];
  faqs: readonly (readonly [string, string])[];
}) {
  const root = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState(false);
  const [discover, setDiscover] = useState(0);
  const [theme, setTheme] = useState(0);

  useLayoutEffect(() => {
    const page = root.current;
    if (!page) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    gsap.registerPlugin(ScrollTrigger);
    let smooth: Lenis | null = null;
    let ticker: ((time: number) => void) | null = null;

    const guide = page.querySelector<HTMLElement>(".ax-guide");
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let frame = 0;
    const follow = () => {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      if (guide) {
        guide.style.transform = `rotateY(${cx * 22}deg) rotateX(${cy * -14}deg) translate3d(${cx * 26}px, ${cy * 16}px, 0)`;
      }
      frame = Math.hypot(tx - cx, ty - cy) > 0.004 ? requestAnimationFrame(follow) : 0;
    };
    const onMove = (event: PointerEvent) => {
      const hero = page.querySelector(".ax-hero");
      if (!hero || !guide) return;
      const rect = hero.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      tx = inside ? (event.clientX - (rect.left + rect.width * 0.46)) / rect.width : 0;
      ty = inside ? (event.clientY - (rect.top + rect.height * 0.42)) / rect.height : 0;
      page.querySelectorAll<HTMLElement>(".ax-float").forEach((item, index) => {
        item.style.translate = `${tx * -(12 + index * 8)}px ${ty * -(8 + index * 5)}px`;
      });
      if (!frame) frame = requestAnimationFrame(follow);
    };

    if (!reduced && finePointer) {
      page.addEventListener("pointermove", onMove);
      window.addEventListener("pointerleave", onMove);
    }

    const context = gsap.context(() => {
      if (!reduced && finePointer) {
        smooth = new Lenis({ lerp: 0.14, smoothWheel: true, syncTouch: false, wheelMultiplier: 1, anchors: true });
        smooth.on("scroll", ScrollTrigger.update);
        ticker = time => smooth?.raf(time * 1000);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);
      }
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: self => page.querySelector(".ax-nav")?.classList.toggle("is-scrolled", self.scroll() > 20)
      });
      nav.forEach(([, id]) => {
        ScrollTrigger.create({
          trigger: `#${id}`,
          start: "top 42%",
          end: "bottom 42%",
          onToggle: self => {
            page.querySelectorAll<HTMLElement>("[data-nav]").forEach(link => {
              if (!self.isActive) return;
              link.classList.toggle("is-active", link.dataset.nav === id);
            });
          }
        });
      });
      if (reduced) return;
      gsap.from(".ax-hero-copy > *", { y: 28, opacity: 0, duration: 0.8, stagger: 0.08, ease: "power2.out" });
      gsap.from(".ax-guide-bob", { y: 36, opacity: 0, duration: 1, delay: 0.1, ease: "power2.out", clearProps: "transform" });
      gsap.from(".ax-float", { y: 30, opacity: 0, duration: 0.9, stagger: 0.1, delay: 0.15, ease: "power2.out" });
      gsap.from(".ax-bar span", {
        scaleX: 0,
        transformOrigin: "left center",
        stagger: 0.08,
        scrollTrigger: { trigger: ".ax-grow", start: "top 70%", once: true }
      });
    }, page);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("resize", refresh);
    requestAnimationFrame(refresh);
    return () => {
      window.removeEventListener("resize", refresh);
      page.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onMove);
      if (frame) cancelAnimationFrame(frame);
      if (ticker) gsap.ticker.remove(ticker);
      smooth?.destroy();
      context.revert();
    };
  }, []);

  return (
    <main ref={root} className={`ax ${sans.className}`}>
      <header className="ax-nav">
        <Link className="ax-brand" href={home}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.2 10.7 7.3 16.8 9 10.7 10.7 9 16.8 7.3 10.7 1.2 9 7.3 7.3Z" fill="currentColor" /></svg>
          {name}
        </Link>
        <nav aria-label={`${name} navigation`}>
          {nav.map(([label, id]) => (
            <a key={id} href={`#${id}`} data-nav={id} onClick={() => setMenu(false)}>{label}</a>
          ))}
        </nav>
        <div className="ax-nav-end">
          <Link className="ax-pill" href={signup}>Apply to Startup School</Link>
          <button className="ax-menu" type="button" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(value => !value)}>
            <span /><span /><span />
          </button>
        </div>
      </header>
      {menu && (
        <div className="ax-sheet">
          {nav.map(([label, id]) => (
            <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>
          ))}
          <Link href={signup} onClick={() => setMenu(false)}>Apply to Startup School</Link>
        </div>
      )}

      <section className="ax-hero">
        <div className="ax-hero-copy">
          <p>{name}</p>
          <h1>Explore beyond the ordinary</h1>
          <Link className="ax-pill ax-start" href={signup}>Get Started</Link>
        </div>
        <div className="ax-guide">
          <div className="ax-guide-bob">
            <Image src="/images/aira-vr-guide.jpg" alt="A person wearing a VR headset" fill priority sizes="(max-width: 900px) 88vw, 44vw" />
          </div>
        </div>
        <div className="ax-ring ax-float">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <defs>
              <path id="ax-orbit" d="M80 80m-58 0a58 58 0 1 1 116 0a58 58 0 1 1-116 0" />
            </defs>
            <text>
              <textPath href="#ax-orbit">AIRA STARTUP SCHOOL · AIRA STARTUP SCHOOL · </textPath>
            </text>
          </svg>
          <p>Learn the mindset and turn an idea into focused work.</p>
        </div>
        <div className="ax-callout ax-float">
          <svg viewBox="0 0 64 40" aria-hidden="true">
            <rect x="6" y="8" width="52" height="22" rx="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M18 30h28M24 30v4h16v-4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M14 19h10M40 19h10" stroke="currentColor" strokeWidth="2" />
          </svg>
          <p>Look at an idea from a new angle</p>
        </div>
        <aside className="ax-note ax-float">
          <div className="ax-note-faces" aria-hidden="true">
            {focus.map(item => <span key={item}>{item.slice(0, 1)}</span>)}
          </div>
          <strong>Three paths</strong>
          <p>{focus.join(", ")}. Sign in through the gateway when you are ready.</p>
          <a href="#discover" aria-label="Explore the three paths">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </a>
        </aside>
      </section>

      <section className="ax-idea" id="discover">
        <div className="ax-chapter-head">
          <p className="ax-kicker">Chapter 01 / Discover</p>
          <h2>Start with a thought. Build something extraordinary.</h2>
          <p>Discover problems worth solving, explore opportunities, and learn how to identify ideas that can become meaningful businesses.</p>
        </div>
        <div className="ax-steps">
          {discoverSteps.map(([title, copy], index) => (
            <button key={title} type="button" className={discover === index ? "is-on" : undefined} aria-expanded={discover === index} onClick={() => setDiscover(index)}>
              <span>0{index + 1}</span>
              <strong>{title}</strong>
              {discover === index && <p>{copy}</p>}
            </button>
          ))}
        </div>
      </section>

      <section className="ax-learn" id="learn">
        <p className="ax-kicker">Chapter 02 / Learn</p>
        <h2>Knowledge is your unfair advantage.</h2>
        <p>Learn entrepreneurship through practical experiences, expert guidance, and real-world startup thinking. These are themes inside the school, not separate courses, fees, or certificates.</p>
        <div className="ax-themes">
          {themes.map(([title, copy, color], index) => (
            <button key={title} type="button" className={`ax-theme${theme === index ? " is-on" : ""}`} style={{ "--card": color } as CSSProperties} onClick={() => setTheme(index)}>
              <i />
              <strong>{title}</strong>
              <span>{copy}</span>
              <em>Theme</em>
            </button>
          ))}
        </div>
      </section>

      <section className="ax-build" id="build">
        <div className="ax-build-pin">
          <p className="ax-kicker">Chapter 03 / Build</p>
          <h2>Don&apos;t just learn. Make it happen.</h2>
          <p>Turn your knowledge into practical experience. Experiment, collaborate, develop products and build something of your own.</p>
          <div className="ax-stages">
            {stages.map(([title, copy], index) => (
              <article className="ax-stage" data-build="open" key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ax-launch" id="launch">
        <div>
          <p className="ax-kicker">Chapter 04 / Launch</p>
          <h2>Your idea deserves to enter the world.</h2>
          <p>Learn how to validate your idea, present your product, connect with customers and take your first steps into the market. The school does not promise a company, funding, or revenue.</p>
          <p className="ax-now">Your journey starts now.</p>
          <Link className="ax-pill" href={signup}>Apply to Startup School</Link>
        </div>
        <div className="ax-launch-art" aria-hidden="true">
          <article>
            <span>01</span><span>02</span><span>03</span>
            <strong>Launch card</strong>
            <p>A sample presentation frame.</p>
          </article>
        </div>
      </section>

      <section className="ax-grow">
        <p className="ax-kicker">Chapter 05 / Grow</p>
        <h2>Your growth doesn&apos;t stop at launch.</h2>
        <p>Continue learning, connect with mentors, meet other founders and discover opportunities to take your ideas further.</p>
        <div className="ax-dashboard">
          {["Skills in practice", "Project milestone", "Mentor conversation", "Founder conversation"].map((label, index) => (
            <article key={label}>
              <h3>{label}</h3>
              <div className="ax-bar"><span style={{ width: ["64%", "48%", "36%", "72%"][index] }} /></div>
            </article>
          ))}
        </div>
        <small>Illustration only. These are not student results.</small>
      </section>

      <section className="ax-programs" id="programs">
        <p className="ax-kicker">The school</p>
        <h2>Choose how you want to build your future.</h2>
        <div className="ax-program-grid">
          {focus.map((label, index) => (
            <article key={label}>
              <span>0{index + 1}</span>
              <h3>{label}</h3>
              <p>{focusCopy[label] ?? description}</p>
              <a href={["#discover", "#learn", "#build"][index] ?? "#learn"}>Explore this focus</a>
            </article>
          ))}
        </div>
      </section>

      <section className="ax-about" id="about">
        <p className="ax-kicker">About the school</p>
        <h2>Clear answers before you join.</h2>
        <p>{description}</p>
        <div>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="ax-close">
        <p className="ax-kicker">Begin</p>
        <h2>Your next big idea starts here.</h2>
        <p>Explore AIRA Startup School and take your first step towards building something meaningful.</p>
        <div className="ax-actions">
          <Link className="ax-pill" href={signup}>Apply to Startup School</Link>
          <a className="ax-pill ax-pill-ghost" href="#programs">Explore programs</a>
        </div>
      </section>

      <footer className="ax-footer">
        <div>
          <strong>{name}</strong>
          <p>Learn, experiment and turn an idea into focused founder work.</p>
          <span>AIRA Skill City Private Limited</span>
        </div>
        <nav aria-label="AIRA Startup School footer">
          <a href="#about">About</a>
          <a href="#programs">Programs</a>
          <a href="#about">Contact</a>
          <a href={ecosystem}>AIRA Skill City</a>
          <Link href={login}>Login</Link>
        </nav>
        <nav aria-label="Related AIRA sites">
          {brands.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
        </nav>
      </footer>
      <StartupSiaAssistant context="landing" journey={signup} />
    </main>
  );
}
