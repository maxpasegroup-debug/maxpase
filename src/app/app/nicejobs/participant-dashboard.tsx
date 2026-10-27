import Link from "next/link";
import { Suspense } from "react";
import { dashboardRead, participantDashboard } from "@/server/nicejobs/participant-dashboard";
import { financeService } from "@/server/nicejobs/finance";
import { DashboardShell } from "./dashboard-shell";
import { DashboardState } from "./dashboard-home";
import { CandidateSpace } from "./candidate-space";
import { JobSpace } from "./job-space";
import { CandidateVision } from "./candidate-vision";
import { GoalsPanel } from "./goals-panel";
import { ExploreLoading, ExploreOpportunities } from "./explore-opportunities";
import { ApplicationWorkspace } from "./application-workspace";
import { OnboardingWorkspace } from "./onboarding-workspace";
import { EmployeeWorkspace } from "./employee-workspace";
import { FinanceWorkspace, financeViews } from "./finance-workspace";
import { KnowledgeWorkspace, knowledgeViews } from "./knowledge-workspace";
import { PerformanceWorkspace, performanceViews } from "./performance-workspace";
import { LeadWorkspace, leadViews } from "./lead-workspace";
import { DashboardNotificationButton } from "./dashboard-notification-button";
import { logoutAction } from "@/server/auth/actions";
import { portalLogoutAction } from "@/app/sites/[site]/actions";
import { formatUserTime } from "@/lib/timezone";

type Props = { userId: string; realm: "corporate" | "jobs"; base: string; query: Record<string, string | string[] | undefined> };
export async function ParticipantDashboard({ userId, realm, base, query }: Props) {
  const view = typeof query.view === "string" ? query.view : "home";
  const context = await participantDashboard.context(userId), worker = context.navigation.data?.worker === true;
  const shared = { userId, realm, base, query };
  const href = (next: string) => `${base}?view=${next}`;
  let content;
  if (["home", "overview"].includes(view)) content = <CandidateSpace userId={userId} base={base} name={context.account.name} worker={worker} />;
  else if (view === "job-space") content = <JobSpace {...shared} worker={worker} />;
  else if (view === "search") {
    const search = typeof query.search === "string" ? query.search : "";
    const results = await participantDashboard.search(userId, worker, search);
    content = <section className="nj-dashboard-search"><h1>Search</h1><p>{results ? `Results for “${search.trim()}”` : "Enter a search between 1 and 120 characters."}</p>{results && <>
      <section><h2>Opportunities</h2>{!results.jobs.data?.records.length && <DashboardState result={results.jobs} empty="No published opportunities match." base={href("search")} />}{results.jobs.data?.records.map(r => <Link key={r.id} href={`${href("opportunities")}&versionId=${encodeURIComponent(r.id)}`}>{r.title}<small>{r.disclosure?.legalEmployer ?? r.company}</small></Link>)}{results.jobs.data?.nextCursor && <Link href={`${href("opportunities")}&search=${encodeURIComponent(search.trim())}`}>All matching opportunities</Link>}</section>
      <section><h2>My training</h2>{!results.learning.data?.records.length && <DashboardState result={results.learning} empty="No assigned training matches." base={href("search")} />}{results.learning.data?.records.map(r => <Link key={r.id} href={`${href("my-onboarding")}&reference=${encodeURIComponent(r.reference)}`}>{r.title}<small>{r.status.replaceAll("_", " ")}</small></Link>)}{results.learning.data?.nextCursor && <Link href={`${href("my-onboarding")}&search=${encodeURIComponent(search.trim())}`}>All matching training</Link>}</section>
      <section><h2>My resources</h2>{results.resources ? <>{!results.resources.data?.records.length && <DashboardState result={results.resources} empty="No authorized resources match." base={href("search")} />}{results.resources.data?.records.map(r => <Link key={r.id} href={`${href("knowledge-detail")}&kind=RESOURCE&versionId=${encodeURIComponent(r.id)}`}>{r.title}<small>{r.summary}</small></Link>)}{results.resources.data?.nextCursor && <Link href={`${href("worker-resources")}&search=${encodeURIComponent(search.trim())}`}>All matching resources</Link>}</> : <p>Work resources become available after authorized worker activation.</p>}</section>
    </>}</section>;
  } else if (view === "notifications") {
    const read = query.read === "read" || query.read === "unread" ? query.read : undefined;
    const page = await participantDashboard.notificationPage(userId, read, typeof query.cursor === "string" ? query.cursor : undefined);
    content = <section><h1>Notifications</h1><form method="get" action={base} className="nj-filters"><input type="hidden" name="view" value="notifications" /><label>Read status<select name="read" defaultValue={read ?? ""}><option value="">All</option><option value="unread">Unread</option><option value="read">Read</option></select></label><button className="nj-dashboard-button">Filter</button></form>{!page.data?.records.length && <DashboardState result={page} empty="No notifications match this view." base={href("notifications")} />}{page.data?.records.map(n => <article key={n.id} className="nj-dashboard-notification"><h2>{String(n.title ?? "Notification")}</h2><p>{String(n.message ?? "")}</p><small>{n.createdAt instanceof Date ? formatUserTime(n.createdAt, context.account.timezone) : ""} · {n.readAt ? "Read" : "Unread"}</small><DashboardNotificationButton id={n.id} realm={realm} read={!!n.readAt} /></article>)}{page.data?.nextCursor && <Link href={`${href("notifications")}${read ? `&read=${read}` : ""}&cursor=${encodeURIComponent(page.data.nextCursor)}`}>More notifications</Link>}</section>;
  } else if (view === "worker-profile") content = <section><h1>My Profile</h1><dl className="nj-detail"><dt>Name</dt><dd>{context.account.name}</dd><dt>Email</dt><dd>{context.account.email}</dd><dt>Timezone</dt><dd>{context.account.timezone}</dd><dt>Account</dt><dd>{worker ? "Active worker assignment verified" : context.navigation.status === "UNAVAILABLE" ? "Temporarily unavailable" : "Candidate account"}</dd></dl><Link href={href("my-applications")}>My applications and offers</Link>{realm === "jobs" ? <p><Link href={base.startsWith("/sites/") ? "/sites/jobs/reset-password" : "/reset-password"}>Reset my PIN</Link></p> : <p><Link href="/app/account">Account preferences</Link></p>}</section>;
  else if (view === "vision") content = <><CandidateVision userId={userId} realm={realm} base={base} />{worker && <GoalsPanel userId={userId} realm={realm} base={base} />}</>;
  else if (view === "worker-wallet" && !worker) {
    const wallet = await dashboardRead(() => financeService.list(userId, { limit: 1 }));
    content = wallet.status === "AVAILABLE" ? <FinanceWorkspace {...shared} /> : <section><h1>Wallet</h1><p>{wallet.status === "UNAVAILABLE" ? "Financial records are temporarily unavailable. Try again later." : "This account does not have access to a wallet yet. Applying, accepting an offer and training do not create earnings or a payable balance."}</p><Link href={href("home")}>Back to My Workspace</Link></section>;
  }
  else if (view === "worker-help" && !worker) content = <section><h1>Help &amp; Support</h1><p>Check your application’s recorded next step and any candidate-visible message from management.</p><Link href={href("my-applications")}>My applications</Link><p>No support messaging channel has been configured for applicants. This page does not send messages.</p></section>;
  else if (view === "opportunities") content = <Suspense fallback={<ExploreLoading />}><ExploreOpportunities userId={userId} base={base} query={query} /></Suspense>;
  else if (view === "apply") content = <ApplicationWorkspace {...shared} query={{ ...query, view: "opportunities" }} />;
  else if (view === "my-applications") content = <ApplicationWorkspace {...shared} />;
  else if (financeViews.includes(view)) content = <FinanceWorkspace {...shared} />;
  else if (["my-onboarding", "worker-training"].includes(view) || view === "my-day" && !worker) content = <OnboardingWorkspace {...shared} query={{ ...query, view: view === "my-day" ? "my-day" : "my-onboarding" }} />;
  else if (!worker) content = <section><h1>Your workspace</h1><p>{context.navigation.status === "UNAVAILABLE" ? "Worker access could not be verified. Try again before continuing." : "Work tools require an authorized active worker assignment. Offer acceptance and training alone do not grant work access."}</p><Link href={href("home")}>My Workspace</Link><Link href={href("my-onboarding")}>My learning</Link></section>;
  else if (knowledgeViews.includes(view)) content = <KnowledgeWorkspace {...shared} />;
  else if (performanceViews.includes(view)) content = <PerformanceWorkspace {...shared} />;
  else if (leadViews.includes(view)) content = <LeadWorkspace {...shared} />;
  else content = <EmployeeWorkspace {...shared} />;
  const logout = realm === "jobs" ? <form action={portalLogoutAction}><input type="hidden" name="site" value="jobs" /><button type="submit">Logout</button></form> : <form action={logoutAction}><button type="submit">Logout</button></form>;
  return <DashboardShell base={base} view={view} candidate={!worker} {...context.account} unread={context.notifications.data?.length ?? null} logout={logout}>{content}</DashboardShell>;
}
