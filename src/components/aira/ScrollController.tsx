"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export type ScrollHandle = { explore: () => void };

export const ScrollController = forwardRef<ScrollHandle, {
  progress: MutableRefObject<{ t: number }>;
  mobile: boolean;
  reduced: boolean;
  onProgress: (amount: number) => void;
  children: ReactNode;
}>(function ScrollController({ progress, mobile, reduced, onProgress, children }, ref) {
  const stage = useRef<HTMLElement>(null);
  const lenis = useRef<Lenis | null>(null);

  useImperativeHandle(ref, () => ({
    explore() {
      if (reduced) {
        document.getElementById("ventures")?.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
      const top = window.innerHeight * (mobile ? 5.1 : 8.1);
      if (lenis.current) lenis.current.scrollTo(top);
      else window.scrollTo({ top, behavior: "smooth" });
    }
  }), [mobile, reduced]);

  useLayoutEffect(() => {
    if (reduced) {
      progress.current.t = 0;
      onProgress(0);
      return;
    }
    const pin = stage.current;
    if (!pin) return;
    gsap.registerPlugin(ScrollTrigger);
    const finePointer = window.matchMedia("(pointer: fine)").matches && !mobile;
    let ticker: ((time: number) => void) | null = null;
    if (finePointer) {
      const smooth = new Lenis({ lerp: 0.16, smoothWheel: true, syncTouch: false, wheelMultiplier: 1 });
      lenis.current = smooth;
      smooth.on("scroll", ScrollTrigger.update);
      ticker = time => smooth.raf(time * 1000);
      gsap.ticker.add(ticker);
      gsap.ticker.lagSmoothing(0);
    }
    const travel = () => window.innerHeight * (mobile ? 7 : 11);
    let frame = 0;
    let shown = -1;
    let target = 0;
    const publish = (amount: number) => {
      if (Math.abs(amount - shown) < 0.0002) return;
      shown = amount;
      progress.current.t = amount;
      pin.dataset.progress = amount.toFixed(3);
      onProgress(amount);
    };
    const read = () => {
      target = Math.min(1, Math.max(0, window.scrollY / travel()));
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        publish(target);
      });
    };
    const trigger = ScrollTrigger.create({
      trigger: pin,
      start: "top top",
      end: () => `+=${Math.round(travel())}`,
      pin: true,
      anticipatePin: 1
    });
    window.addEventListener("scroll", read, { passive: true });
    lenis.current?.on("scroll", read);
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("resize", refresh);
    requestAnimationFrame(refresh);
    publish(Math.min(1, Math.max(0, window.scrollY / travel())));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", read);
      trigger.kill();
      if (ticker) gsap.ticker.remove(ticker);
      lenis.current?.destroy();
      lenis.current = null;
    };
  }, [mobile, onProgress, progress, reduced]);

  return (
    <section ref={stage} className="aira-stage" style={{ position: "relative", height: "100svh", overflow: "hidden" }} aria-label="Journey into AIRA">
      {children}
    </section>
  );
});
