"use client";
import { RotateCcw } from "lucide-react";
export default function ErrorView({ reset }: { reset: () => void }) { return <section className="business-empty"><h2>Company View Unavailable</h2><p role="alert">Check your company access and filters, then try again.</p><button className="button secondary" onClick={reset}><RotateCcw size={16}/>Retry</button></section>; }
