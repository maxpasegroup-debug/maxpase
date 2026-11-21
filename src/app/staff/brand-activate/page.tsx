import Link from "next/link";
import { BrandActivationForm } from "./form";

export default async function BrandActivationPage({ searchParams }: { searchParams: Promise<{ challenge?: string }> }) {
  const { challenge } = await searchParams;
  return <main className="mx-auto min-h-screen max-w-xl px-6 py-16"><section className="business-empty"><p className="eyebrow">MAXPASE GROUP / EMPLOYEE SETUP</p><h1>Activate your brand workspace</h1><p>Enter the verification code sent to your work email, then create your password.</p><BrandActivationForm challengeId={typeof challenge === "string" ? challenge : ""}/><p className="mt-6 text-sm"><Link href="/staff/login">Already activated? Sign in</Link></p></section></main>;
}
