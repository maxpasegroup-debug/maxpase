"use client";
export default function CommunicationError({ reset }: { reset: () => void }) { return <section><h1>Communication unavailable</h1><p>Access or data is unavailable. No successful operation is claimed.</p><button className="button secondary" onClick={reset}>Retry</button></section>; }
