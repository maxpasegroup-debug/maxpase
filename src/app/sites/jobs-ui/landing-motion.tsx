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
    const desktop = window.matchMedia("(min-width: 861px) and (pointer: fine)").matches;
    gsap.registerPlugin(ScrollTrigger);

    let lenis: Lenis | null = null;
    let ticker: ((time: number) => void) | null = null;
    const context = gsap.context(() => {
      const scenes = Array.from(page.querySelectorAll<HTMLElement>("[data-scene]"));

      scenes.forEach(scene => {
        const id = scene.dataset.scene;
        ScrollTrigger.create({
          trigger: scene,
          start: "top 42%",
          end: "bottom 42%",
          onToggle: self => {
            if (self.isActive && id) page.dataset.activeSection = id;
          }
        });
      });

      if (reducedMotion) return;

      if (desktop) {
        lenis = new Lenis({ lerp: 0.14, smoothWheel: true, syncTouch: false, wheelMultiplier: 0.9, anchors: true });
        lenis.on("scroll", ScrollTrigger.update);
        ticker = time => lenis?.raf(time * 1000);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);
      }

      const hero = page.querySelector<HTMLElement>("[data-scene='hero']");
      const heroCopy = page.querySelector<HTMLElement>("[data-scene-copy='hero']");
      const heroImage = page.querySelector<HTMLElement>("[data-scene-image='hero']");
      if (heroCopy) {
        gsap.fromTo(heroCopy.children, { y: 22, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.82, stagger: 0.075, ease: "power2.out", clearProps: "transform"
        });
      }
      if (hero && heroCopy && heroImage && desktop) {
        const opening = gsap.timeline({
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "+=52%",
            scrub: 0.65,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true
          }
        });
        opening.to(heroCopy, { y: -23, autoAlpha: 0.78, duration: 0.58, ease: "power1.out" }, 0);
        opening.to(heroImage, { scale: 1.075, xPercent: 1.2, duration: 1, ease: "none" }, 0);
      }

      const experience = page.querySelector<HTMLElement>("[data-scene='experience']");
      const experienceCopy = page.querySelector<HTMLElement>("[data-scene-copy='experience']");
      const experienceImage = page.querySelector<HTMLElement>("[data-scene-image='experience']");
      if (experience && experienceImage) {
        gsap.fromTo(experienceImage, { scale: 1.08 }, {
          scale: 1, ease: "none",
          scrollTrigger: { trigger: experience, start: "top bottom", end: "bottom top", scrub: 0.7 }
        });
      }
      if (experienceCopy) {
        gsap.fromTo(experienceCopy, { y: 34, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.85, ease: "power2.out", clearProps: "transform",
          scrollTrigger: { trigger: experienceCopy, start: "top 78%", once: true }
        });
      }
      const experienceWords = page.querySelectorAll<HTMLElement>("#experience-title [data-word]");
      if (experienceWords.length && experience) {
        gsap.fromTo(experienceWords, { y: 24, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.58, stagger: 0.1, ease: "power2.out", clearProps: "transform",
          scrollTrigger: { trigger: experience, start: "top 56%", once: true }
        });
      }
      const benefits = page.querySelectorAll<HTMLElement>("[data-benefit]");
      if (benefits.length && experience) {
        gsap.fromTo(benefits, { y: 18, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.58, stagger: 0.12, ease: "power2.out", clearProps: "transform",
          scrollTrigger: { trigger: experience, start: "top 46%", once: true }
        });
      }

      const invitation = page.querySelector<HTMLElement>("[data-scene='invitation']");
      const invitationCopy = page.querySelector<HTMLElement>("[data-scene-copy='invitation']");
      const invitationImage = page.querySelector<HTMLElement>("[data-scene-image='invitation']");
      if (invitation && invitationImage) {
        gsap.fromTo(invitationImage, { scale: 1.07 }, {
          scale: 1, ease: "none",
          scrollTrigger: { trigger: invitation, start: "top bottom", end: "bottom top", scrub: 0.7 }
        });
      }
      if (invitationCopy) {
        gsap.fromTo(invitationCopy, { y: 38, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.9, ease: "power2.out", clearProps: "transform",
          scrollTrigger: { trigger: invitationCopy, start: "top 76%", once: true }
        });
      }
    }, page);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("resize", refresh);
    requestAnimationFrame(refresh);
    return () => {
      window.removeEventListener("resize", refresh);
      if (ticker) gsap.ticker.remove(ticker);
      lenis?.destroy();
      if (ticker) gsap.ticker.lagSmoothing(500, 33);
      context.revert();
    };
  }, []);

  return null;
}
