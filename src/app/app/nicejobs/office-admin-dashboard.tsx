import Link from "next/link";
import { niceJobsControlHref } from "@/lib/nicejobs-control-navigation";

type Entry = { view: string; label: string };
type Group = { key: string; label: string; entries: Entry[] };
export function OfficeAdminDashboard({ groups, base, query }: { groups: Group[]; base: string; query: Record<string, string | string[] | undefined> }) {
  const workspaces = groups.filter(group => group.key !== "office").map(group => ({ ...group, entries: group.entries.filter(entry => entry.view !== "office-admin") })).filter(group => group.entries.length);
  return <section className="nj-workspace nj-office-admin">
    <header className="nj-office-admin-header"><p className="nj-office-kicker">NICEJOBS · OFFICE WORKSPACE</p><h1>Office Admin</h1><p>Open the tasks and workspaces your account is authorized to manage.</p></header>
    {workspaces.length ? <div className="nj-office-admin-groups">{workspaces.map(group => <section className="nj-office-admin-group" key={group.key}><h2>{group.label}</h2><div className="nj-office-admin-grid">{group.entries.map(entry => <Link className="nj-office-admin-card" key={entry.view} href={niceJobsControlHref(base, entry.view, query)}><span>{entry.label}</span><span aria-hidden="true">→</span></Link>)}</div></section>)}</div> : <p>Your office workspace has no assigned work areas yet. Ask the MAXPASE Boss to grant the specific NICEJOBS permissions you need.</p>}
    <p className="nj-office-admin-note">This dashboard follows your existing permissions. Financial approvals, participant records and system settings stay available only to accounts with those specific grants.</p>
  </section>;
}
