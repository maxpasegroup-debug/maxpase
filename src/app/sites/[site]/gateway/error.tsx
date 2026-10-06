"use client";
export default function GatewayError({ reset }: { reset: () => void }) { return <section className="public-page"><div><h1>Gateway temporarily unavailable</h1><button className="button" onClick={reset}>Try again</button></div></section>; }
