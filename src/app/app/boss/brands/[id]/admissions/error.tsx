"use client";
export default function Error({ reset }: { reset: () => void }) { return <main className="boss-view"><h1>Admissions are unavailable</h1><p>The application queue could not be loaded. Try again.</p><button className="button" onClick={reset}>Retry</button></main>; }
