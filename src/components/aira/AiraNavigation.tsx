"use client";

import Link from "next/link";
import { SkillCityLogo } from "@/components/skillcity-logo";

export function AiraNavigation({ home, login, onExplore, onSkipToBrands }: { home: string; login: string; onExplore: () => void; onSkipToBrands: () => void }) {
  return (
    <header className="aira-nav">
      <Link href={home} className="aira-logo" aria-label="AIRA Skill City home"><SkillCityLogo size={60} /></Link>
      <nav className="aira-nav-actions" aria-label="AIRA Skill City">
        <button type="button" className="aira-explore" onClick={onExplore}>Explore</button>
        <button type="button" className="aira-skip-brands" onClick={onSkipToBrands}>Skip to brands</button>
        <Link className="aira-login" href={login}>Login</Link>
      </nav>
    </header>
  );
}
