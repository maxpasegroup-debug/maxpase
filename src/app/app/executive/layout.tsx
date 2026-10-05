import Link from "next/link";
const views = ["briefing", "attention", "decisions", "companies", "projects", "goals", "operations", "kpis", "risks", "opportunities", "changes", "metrics"];
export default function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  return <><header className="company-header"><h1>Executive Command Center</h1><Link href="/app/executive">MAXPASE OS</Link></header><nav className="company-navigation executive-navigation" aria-label="Executive views">{views.map(v => <Link key={v} href={`/app/executive/${v}`}>{v === "kpis" ? "KPIs" : v[0].toUpperCase() + v.slice(1)}</Link>)}</nav>{children}</>;
}
