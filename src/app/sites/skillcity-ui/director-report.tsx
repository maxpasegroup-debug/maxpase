import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessError } from "@/server/authorization/engine";
import { directorReport } from "@/server/skillcity/director-report";

export async function DirectorReportWorkspace({ userId, email, base, divisionId, kind, cursor }: { userId: string; email: string; base: string; divisionId: string; kind: string; cursor?: string }) {
  let report: Awaited<ReturnType<typeof directorReport.read>>;
  try { report = await directorReport.read(userId, divisionId, kind, cursor); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const params = new URLSearchParams({ view: "director-report", divisionId: report.division.id, kind: report.kind });
  const freshness = !report.lastUpdated ? "No recorded updates" : report.calculatedAt.getTime() - report.lastUpdated.getTime() > 7 * 86400000 ? "Last update over 7 days ago" : "Updated within 7 days";
  return <main className="portal-workspace portal-skillcity sc-workspace"><header className="portal-header"><Link className="portal-wordmark" href={base}>AIRA Skill City<span>EMPLOYEE WORKPLACE</span></Link><span>{email}</span></header><div className="sc-main"><nav aria-label="Breadcrumb"><Link href={`${base}?view=director`}>Director desk</Link> / {report.division.name} / {report.kind}</nav><section className="sc-section"><h1>{report.division.name}: {report.kind.replaceAll("-", " ")}</h1><p>{report.count} source records in this authorized division. {freshness}. Updated at {report.calculatedAt.toISOString()}.</p>{report.rows.length ? <ul className="executive-list">{report.rows.map(row => <li key={row.id}><strong>{row.title}</strong> · {row.status.replaceAll("_", " ")} · Updated {row.updatedAt.toISOString()}</li>)}</ul> : <p>No matching records. Return to the director desk to review another area.</p>}{report.nextCursor && <Link href={`${base}?${params}&cursor=${encodeURIComponent(report.nextCursor)}`}>Next records</Link>}</section></div></main>;
}
