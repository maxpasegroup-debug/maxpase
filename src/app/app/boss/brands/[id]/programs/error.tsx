"use client";
export default function Error({ reset }: { reset: () => void }) { return <main className="boss-view"><h1>Programmes are unavailable</h1><p>We could not load the programme registry. Try again.</p><button className="button" onClick={reset}>Retry</button></main>; }
