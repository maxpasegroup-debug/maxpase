"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="business-empty"><h2>Records unavailable</h2><p className="error" role="alert">Please try loading this view again.</p><button className="button" onClick={reset}>Retry</button></div>; }

