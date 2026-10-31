"use client";

import Link from "next/link";

export function AiraNavigation({ home, login, onExplore }: { home: string; login: string; onExplore: () => void }) {
  return (
    <header className="aira-nav">
      <Link href={home} className="aira-logo" aria-label="AIRA Skill City home">AIRA</Link>
      <nav className="aira-nav-actions" aria-label="AIRA Skill City">
        <button type="button" className="aira-explore" onClick={onExplore}>Explore</button>
        <Link className="aira-login" href={login}>Login</Link>
      </nav>
    </header>
  );
}
