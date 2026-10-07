"use client";
export default function ErrorView({ reset }: { reset: () => void }) { return <section><h1>Nice Jobs is temporarily unavailable</h1><p role="alert">No successful change is confirmed. Refresh before retrying.</p><button onClick={reset}>Retry</button></section>; }
