"use client";
export default function OperationsError({ reset }: { reset: () => void }) {
  return <section className="section"><h1>Operation unavailable</h1><p>Check your access and try again.</p><button className="button secondary" onClick={reset}>Retry</button></section>;
}
