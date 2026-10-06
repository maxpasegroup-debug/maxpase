import { notFound } from "next/navigation";
import { ExecutiveView } from "../view";
import { bossViews, isBossView } from "@/lib/workspace-navigation";
export default async function ExecutiveDetailPage({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { view } = await params;
  if (!["briefing", "attention", "decisions", "companies", "projects", "goals", "operations", "kpis", "risks", "opportunities", "changes", "metrics"].includes(view)) notFound();
  return <><h1>{isBossView(view) ? bossViews[view] : view === "kpis" ? "Performance indicators" : "Operational metrics"}</h1><ExecutiveView view={view} query={await searchParams} /></>;
}
