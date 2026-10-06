"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="business-empty"><h2>Command center unavailable</h2><p role="alert">No successful result is claimed.</p><button className="button" onClick={reset}>Retry</button></section>; }
