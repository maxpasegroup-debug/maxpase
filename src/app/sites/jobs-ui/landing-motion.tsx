"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export function JobsLandingMotion() {
  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>("[data-jobs-landing]");
    if (!page) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touchDevice = window.matchMedia("(pointer: coarse)").matches;
    const desktop = !touchDevice && window.matchMedia("(min-width: 761px)").matches;
    gsap.registerPlugin(ScrollTrigger);

    let lenis: Lenis | null = null;
    let ticker: ((time: number) => void) | null = null;
    const context = gsap.context(() => {
      const hero = page.querySelector<HTMLElement>("[data-hero]");
      const heroImage = page.querySelector<HTMLElement>("[data-hero-image]");
      const heroShade = page.querySelector<HTMLElement>("[data-hero-shade]");
      const heroCopy = page.querySelector<HTMLElement>("[data-hero-copy]");
      const transitionType = page.querySelector<HTMLElement>("[data-hero-transform]");
      const progress = page.querySelector<HTMLElement>("[data-hero-progress]");

      if (desktop && !reducedMotion) {
        lenis = new Lenis({ duration: 1.05, smoothWheel: true, syncTouch: false, wheelMultiplier: 0.9 });
        lenis.on("scroll", ScrollTrigger.update);
        ticker = time => lenis?.raf(time * 1000);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);
      }

      if (reducedMotion) return;
      gsap.fromTo(heroCopy?.children ?? [],
        { y: 25, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.76, stagger: 0.075, ease: "power2.out", clearProps: "transform" }
      );

      page.querySelectorAll<HTMLElement>("[data-reveal]").forEach(element => {
        gsap.fromTo(element, { y: 30, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.8, ease: "power2.out", clearProps: "transform",
          scrollTrigger: { trigger: element, start: "top 84%", once: true }
        });
      });
      page.querySelectorAll<HTMLElement>("[data-reveal-image]").forEach(element => {
        gsap.fromTo(element, { clipPath: "inset(8% 7% 8% 7% round 28px)", y: 20 }, {
          clipPath: "inset(0% 0% 0% 0% round 6px 100px 6px 6px)", y: 0, duration: 1.05, ease: "power2.out",
          scrollTrigger: { trigger: element, start: "top 83%", once: true }
        });
      });

      if (desktop && hero && heroImage && heroCopy && transitionType && progress) {
        const transition = gsap.timeline({
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "+=92%",
            scrub: 0.75,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: self => hero.classList.toggle("is-transforming", self.progress > 0.08)
          }
        });
        transition.to(heroCopy, { y: -36, autoAlpha: 0, duration: 0.25, ease: "power1.in" }, 0);
        transition.to(heroImage, {
          clipPath: "inset(7% 5% 9% 47% round 30px)",
          scale: 0.94,
          xPercent: -1,
          duration: 1,
          ease: "power2.inOut"
        }, 0);
        transition.to(heroShade, { opacity: 0.2, duration: 0.72, ease: "power1.out" }, 0.12);
        transition.to(transitionType, { autoAlpha: 1, x: 0, scale: 1, duration: 0.65, ease: "power2.out" }, 0.25);
        transition.to(progress, { scaleX: 1, duration: 1, ease: "none" }, 0);

        page.querySelectorAll<HTMLElement>("[data-parallax]").forEach(image => {
          gsap.to(image, { yPercent: -5, ease: "none", scrollTrigger: { trigger: image.parentElement, start: "top bottom", end: "bottom top", scrub: 0.6 } });
        });
      }

      const chapterIds = ["discover", "opportunities", "learn", "journey", "growth"];
      chapterIds.forEach(id => {
        const section = page.querySelector<HTMLElement>(`#${id}`);
        if (!section) return;
        ScrollTrigger.create({
          trigger: section,
          start: "top 40%",
          end: "bottom 40%",
          onToggle: self => {
            if (!self.isActive) return;
            page.querySelectorAll<HTMLElement>("[data-nav]").forEach(link => link.toggleAttribute("data-current", link.dataset.nav === id));
          }
        });
      });

      const steps = Array.from(page.querySelectorAll<HTMLElement>("[data-journey-step]"));
      const line = page.querySelector<HTMLElement>("[data-journey-line]");
      const journeySection = page.querySelector<HTMLElement>("#journey");
      if (steps.length && journeySection) {
        ScrollTrigger.create({
          trigger: journeySection,
          start: "top 68%",
          end: "bottom 52%",
          scrub: 0.35,
          onUpdate: self => {
            if (line) gsap.set(line, { scaleX: self.progress });
            const activeIndex = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
            steps.forEach((step, index) => step.toggleAttribute("data-current", index === activeIndex));
          }
        });
      }
    }, page);

    const refresh = () => ScrollTrigger.refresh();
    requestAnimationFrame(refresh);
    return () => {
      if (ticker) gsap.ticker.remove(ticker);
      lenis?.destroy();
      if (ticker) gsap.ticker.lagSmoothing(500, 33);
      context.revert();
    };
  }, []);

  return null;
}
