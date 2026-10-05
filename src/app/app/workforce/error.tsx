"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="business-empty"><h2>This view is unavailable</h2><p className="error" role="alert">Access may be restricted or the records could not be loaded.</p><button className="button" onClick={reset}>Retry</button></div>; }

