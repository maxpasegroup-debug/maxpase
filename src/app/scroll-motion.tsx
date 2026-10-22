"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

const shells = ".al-form, .startup-hero-art, .startup-next-step, .hero-art-card, .group-hero-office, .al-hero, .portal-hero";

function isCard(element: Element) {
  return element.matches(`article, [data-card], ${shells}`) || (element.matches("li") && element.parentElement?.tagName === "OL");
}

function insideCard(element: Element, root: Element) {
  let parent = element.parentElement;
  while (parent && parent !== root) {
    if (isCard(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}

export function ScrollMotion() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const root = document.querySelector("[data-motion]");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = [...root.querySelectorAll(`article, ol > li, [data-card], ${shells}, h1, h2, h3, p, img`)].filter(element => {
      if (element.closest("header, footer, nav")) return false;
      return isCard(element) || !insideCard(element, root);
    });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("motion-in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    nodes.forEach(element => {
      element.classList.add("motion-item");
      const order = [...(element.parentElement?.children ?? [])].filter(child => child.classList.contains("motion-item")).indexOf(element);
      if (order > 0) (element as HTMLElement).style.transitionDelay = `${Math.min(order, 4) * 80}ms`;
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9 && rect.bottom > 24) element.classList.add("motion-in");
      else observer.observe(element);
    });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
