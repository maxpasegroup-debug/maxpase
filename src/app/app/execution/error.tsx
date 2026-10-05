"use client";
export default function ErrorView({ reset }: { reset: () => void }) { return <section><h1>Execution unavailable</h1><p className="error">This scope is unavailable or the request could not be completed.</p><button className="button" onClick={reset}>Retry</button></section>; }
