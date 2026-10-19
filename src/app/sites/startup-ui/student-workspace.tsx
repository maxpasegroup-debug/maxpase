import Link from "next/link";
import { BookOpen, CalendarDays, LogOut } from "lucide-react";
import { startupStudentService } from "@/server/portals/startup-student";
import { portalLogoutAction } from "../[site]/actions";

export async function StartupStudentWorkspace({ userId, email, home }: { userId: string; email: string; home: string }) {
  const enrollments = await startupStudentService.dashboard(userId);
  return <main className="portal-workspace portal-startup"><header className="portal-header"><Link className="portal-wordmark" href={home}>AIRA Startup School<span>MY LEARNING</span></Link><span>{email}</span><form action={portalLogoutAction}><input type="hidden" name="site" value="startup"/><button className="portal-button"><LogOut size={17}/> Sign out</button></form></header><div className="portal-workspace-inner"><header className="portal-workspace-heading"><p className="portal-kicker">MY LEARNING</p><h1>My programmes</h1></header>{!enrollments.length && <section className="portal-records"><h2>No active programmes</h2><p>Your account has no active Startup School enrollment. Contact your programme coordinator if you expected one.</p></section>}{enrollments.map(row => <section className="portal-records" key={row.id}><h2><BookOpen size={18}/> {row.program}</h2><p>{row.description}</p><p>Batch: {row.batch} / {row.status.toLowerCase()}</p><p><CalendarDays size={16}/> {row.start?.toISOString().slice(0,10) ?? "Start not scheduled"} to {row.end?.toISOString().slice(0,10) ?? "End not scheduled"}</p>{row.durationDays && <p>{row.durationDays} programme days</p>}</section>)}</div></main>;
}
