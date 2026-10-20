import { describe, expect, it, vi } from "vitest";
import { dashboardSection, dashboardSections, isParticipantDashboardView, learningPercent, participantStage } from "@/lib/nicejobs-dashboard";
import { dashboardRead, createParticipantDashboard } from "@/server/nicejobs/participant-dashboard";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsUnavailable } from "@/server/nicejobs/input";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import type { ComponentType, ReactNode } from "react";
import { curriculumIssues,curriculumSchedule,emptyCurriculum } from "@/server/nicejobs/curriculum";
import { isTimezone } from "@/lib/timezone";

// Compile this one JSX surface; Next's preserve setting remains unchanged.
const source = readFileSync("src/app/app/nicejobs/dashboard-shell.tsx", "utf8");
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const shellModule = { exports: {} as { DashboardShell: ComponentType<{ base: string; view: string; name: string; email: string; search?: string; unread: number | null; logout: ReactNode; children: ReactNode }> } };
const nativeRequire = createRequire(import.meta.url);
runInNewContext(compiled, { module: shellModule, exports: shellModule.exports, require: (name: string) => name === "@/lib/nicejobs-dashboard" ? { dashboardSection, dashboardSections } : nativeRequire(name) });
const { DashboardShell } = shellModule.exports;

function loadComponent<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

describe("Nice Jobs participant dashboard", () => {
  it("renders honest training control, review turnaround and separate activation without private notes",()=>{
    const {TrainingManagement}=loadComponent<{TrainingManagement:ComponentType<Record<string,unknown>>}>("src/app/app/nicejobs/training-management.tsx",{"./onboarding-form":{OnboardingCommand:(p:{label:string})=>createElement("button",null,p.label)}});
    const detail={status:"READY",today:{timezone:"Asia/Kolkata",counts:{awaitingReview:1,overdue:1}},control:{paused:true,pauseAllowed:true,extensionAllowed:false,proposals:[{id:"proposal",control:{kind:"PROGRAMME_CHANGE",versionId:"approved-v2"},status:"APPROVED",requestedAt:new Date("2026-10-13T08:00:00Z"),decidedAt:new Date("2026-10-13T09:00:00Z"),feedback:"<script>escaped guidance</script>"}]},permissions:{manage:true,controlDecide:true,activate:false},scheduledReminders:[{id:"r",status:"PENDING",remindAt:new Date("2026-10-14T08:00:00Z"),reason:"Review due"}],managementReviews:[{id:"review",kind:"OJT_REVIEW",outcome:"APPROVED",reviewedAt:new Date("2026-10-13T09:00:00Z"),reviewer:{person:{displayName:"Recorded trainer"}},submission:{submittedAt:new Date("2026-10-13T08:00:00Z"),progress:{key:"day_10"}},feedback:"Released feedback",privateNotes:"PRIVATE-REVIEW-SECRET"}]};
    const props={detail,realm:"jobs",own:false,command:()=>({}),href:()=>"/gateway?view=activation"};
    const html=renderToStaticMarkup(createElement(TrainingManagement,props));expect(html).toContain("calendar remains unchanged");expect(html).toContain("60 minutes");expect(html).toContain("Not applied:");expect(html).toContain("Pending is not delivered");expect(html).not.toContain("PRIVATE-REVIEW-SECRET");expect(html).toContain("&lt;script&gt;");expect(html).not.toContain('href="/gateway?view=activation"');
    const permitted=renderToStaticMarkup(createElement(TrainingManagement,{...props,detail:{...detail,permissions:{...detail.permissions,activate:true}}}));expect(permitted).toContain("separately authorized worker activation");
  });
  it("renders Today priorities, honest media/report signals and historical snapshot labels",()=>{
    const {TrainingToday}=loadComponent<{TrainingToday:ComponentType<Record<string,unknown>>}>("src/app/app/nicejobs/training-today.tsx",{"./onboarding-form":{OnboardingCommand:(p:{label:string})=>createElement("button",null,p.label)}});
    const detail={title:"Synthetic training",reference:"own-reference",status:"OJT",today:{date:"2026-10-13",timezone:"Asia/Kolkata",day:5,stage:"Practice",nonWorkingDay:false,beforeStart:false,scheduleEnded:false,counts:{completed:2,pending:1,awaitingReview:1,overdue:1,future:95},days:{unit:"days",completed:0,required:100},upcoming:[{day:10,title:"Synthetic milestone",stage:"Practice",date:"2026-10-18"}]},dailyReports:[],nextRequirement:{id:"next-activity",title:"Required evidence",status:"SUBMITTED"},progress:[{id:"next-activity"}]};
    const props={detail,realm:"jobs",href:()=>"/gateway?view=my-onboarding",command:()=>({}),own:true};
    const html=renderToStaticMarkup(createElement(TrainingToday,props));expect(html).toContain("Submission alone is not completion");expect(html).toContain("Submit daily training report");expect(html).toContain("Overdue (including review waits)");expect(html).toContain('href="#training-next-activity"');expect(html).toContain("Synthetic milestone");
    const paused=renderToStaticMarkup(createElement(TrainingToday,{...props,detail:{...detail,control:{paused:true}}}));expect(paused).not.toContain("Submit daily training report");
    const recorded={date:"2026-10-13",submissions:[{id:"report-submission",attempt:1,submittedAt:new Date("2026-10-13T10:00:00Z"),notes:"<script>escaped report</script>",snapshot:{completed:0,awaitingReview:1,overdue:1,completedToday:[]}}]};
    const saved=renderToStaticMarkup(createElement(TrainingToday,{...props,detail:{...detail,dailyReports:[recorded]}}));expect(saved).toContain("Record report correction");expect(saved).toContain("Recorded, not training approval");expect(saved).toContain("At reporting:");expect(saved).toContain("&lt;script&gt;");expect(saved).not.toContain("<script>");
  });
  it("shows recorded candidate checkpoints without treating accepted offers as enrollment or activation",()=>{
    type Props={status:string;eligibility:string;screening:string;orientation:boolean|null;policies:boolean|null;interviewRequired:boolean|null;interviewCompleted:boolean;offerIssued:boolean;offerAccepted:boolean;offerExpired:boolean;enrollment:string|null;programme:{durationDays:number;dayMode:string;timezone:string;jobVersion:number}|null};
    const {CandidateJourney}=loadComponent<{CandidateJourney:ComponentType<Props>}>("src/app/app/nicejobs/candidate-journey.tsx",{});
    const p={status:"OFFER_ACCEPTED",eligibility:"ELIGIBLE",screening:"PASSED",orientation:true,policies:true,interviewRequired:true,interviewCompleted:true,offerIssued:true,offerAccepted:true,offerExpired:false,enrollment:null,programme:{durationDays:100,dayMode:"WORKING",timezone:"Asia/Kolkata",jobVersion:3}};
    const html=renderToStaticMarkup(createElement(CandidateJourney,p));expect(html).toContain("Your confirmation required");expect(html).toContain("100 working days");expect(html).toContain("neither activates employment");expect(html).not.toContain("Enrolled");
    const enrolled=renderToStaticMarkup(createElement(CandidateJourney,{...p,enrollment:"NOT_STARTED"}));expect(enrolled).toContain("Enrolled");
    const missing=renderToStaticMarkup(createElement(CandidateJourney,{...p,orientation:null,policies:null,offerAccepted:false,offerExpired:true,enrollment:"CANCELLED"}));expect(missing).toContain("Not configured");expect(missing).toContain("Expired / Contact your manager");expect(missing).toContain("Cancelled");
  });
  it("renders ten editable day slots per stage and honest incomplete/review labels without exposing a giant form",()=>{
    type Props={value:ReturnType<typeof emptyCurriculum>;update:(v:ReturnType<typeof emptyCurriculum>)=>void;resources:{id:string;name:string;type:string}[];reviewer:string;renderQuiz:()=>ReactNode};
    const {CurriculumBuilder}=loadComponent<{CurriculumBuilder:ComponentType<Props>}>("src/app/app/nicejobs/curriculum-builder.tsx",{"@/server/nicejobs/curriculum":{curriculumIssues,curriculumSchedule},"@/lib/timezone":{isTimezone}});
    const value=emptyCurriculum();value.stages[0].activities[0].learningText="<script>escaped learning</script>";value.stages[0].activities[9].milestone=false;
    const html=renderToStaticMarkup(createElement(CurriculumBuilder,{value,update:()=>{},resources:[],reviewer:"Not nominated",renderQuiz:()=>null}));
    expect(html).toContain("Incomplete draft");expect(html).toContain("Calendar days");expect(html).toContain("Working days");expect(html).toContain("No deadline shifting");expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Day 10</button>");expect(html).not.toContain("Day 11</button>");expect(html).toContain('aria-pressed="true"');expect(html).toContain("end-of-stage milestone");
  });
  it("keeps uploaded preview URLs in the server-selected realm and escapes captions/transcripts", () => {
    type Props={realm:string;base:string;versionId:string;management:boolean;filename:string;mime:string;captions:string;transcript:string;applicationReference?:string};
    const {ContentPreview}=loadComponent<{ContentPreview:ComponentType<Props>}>("src/app/app/nicejobs/content-preview.tsx",{"next/image":{__esModule:true,default:(props:{src:string;alt:string})=>createElement("img",{src:props.src,alt:props.alt})}});
    const props={realm:"jobs",base:"/gateway",versionId:"private-version",management:false,filename:"lesson.mp4",mime:"video/mp4",captions:"Caption",transcript:"<script>not executable</script>",applicationReference:"owned-reference"};
    const html=renderToStaticMarkup(createElement(ContentPreview,props));
    expect(html).toContain('/content/private-version?management=false&amp;applicationReference=owned-reference');expect(html).not.toContain("/sites/jobs/content");expect(html).toContain('kind="captions"');expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");
    const local=renderToStaticMarkup(createElement(ContentPreview,{...props,base:"/sites/jobs/gateway"}));expect(local).toContain("/sites/jobs/content/private-version");
    const corporate=renderToStaticMarkup(createElement(ContentPreview,{...props,realm:"corporate",base:"/app/nicejobs",mime:"image/png"}));expect(corporate).toContain("/api/nicejobs/content/private-version");expect(corporate).not.toContain("/_next/image");
  });
  it("renders missing setup requirements and the real publication stage without granting approval", () => {
    const { ProgrammeChecklist } = loadComponent<{ ProgrammeChecklist: ComponentType<{ setup: { required: boolean; ready: boolean; issues: string[]; items: { key: string; title: string; target: string; issues: string[] }[] }; status: string; targets?: string[] }> }>("src/app/app/nicejobs/programme-checklist.tsx", {});
    const setup = { required: true, ready: false, issues: ["Manager missing", "Training missing"], items: [{ key: "manager", title: "Responsible manager", target: "programme-setup", issues: ["Manager missing"] }, { key: "outcomes", title: "Training outcomes", target: "programme-setup", issues: ["Training missing"] }] };
    const html = renderToStaticMarkup(createElement(ProgrammeChecklist, { setup, status: "DRAFT", targets: ["programme-setup"] }));
    expect(html).toContain("2 requirements outstanding"); expect(html).toContain("Manager missing"); expect(html).toContain("Training missing");
    expect(html).toContain('href="#programme-setup"'); expect(html).toContain('aria-current="step">Draft');
    expect(html).toContain("Review and publication are blocked");
    const readOnly = renderToStaticMarkup(createElement(ProgrammeChecklist, { setup: { ...setup, ready: true, issues: [], items: [] }, status: "PENDING_VERIFICATION" }));
    expect(readOnly).toContain('aria-current="step">Ready for review'); expect(readOnly).toContain("Publication still requires authorized review and approval"); expect(readOnly).not.toContain("href=");
  });
  it("groups detailed participant destinations without intercepting management", () => {
    expect(dashboardSections.map(([, label]) => label)).toEqual(["Home", "My Work", "Find Opportunities", "My Learning", "My Earnings", "My Profile", "Help & Support"]);
    for (const view of ["worker-wallet", "worker-payouts", "worker-incentive-detail", "worker-statement"]) expect(dashboardSection(view)).toBe("worker-wallet");
    expect(dashboardSection("my-applications")).toBe("opportunities");
    expect(isParticipantDashboardView("vision")).toBe(true);
    expect(dashboardSection("worker-profile")).toBe("worker-profile");
    for (const view of ["templates", "applications", "onboarding", "activation", "finance-wallets", "workforce-command"]) expect(isParticipantDashboardView(view)).toBe(false);
    expect(isParticipantDashboardView("lead-detail", { control: "boss" })).toBe(false);
    expect(isParticipantDashboardView("knowledge-detail", { management: "true" })).toBe(false);
    expect(isParticipantDashboardView()).toBe(true);
  });
  it("never equates training or offer acceptance with worker authorization", () => {
    expect(participantStage(false, 0, false)).toBe("APPLICANT");
    expect(participantStage(false, 1, true)).toBe("SELECTED_CANDIDATE");
    expect(participantStage(false, 0, true)).toBe("SELECTED_CANDIDATE");
    expect(participantStage(true, 0, false)).toBe("ACTIVE_WORKER");
    expect(learningPercent(0, 0, true)).toBeNull();
    expect(learningPercent(0, 5, false)).toBeNull();
    expect(learningPercent(0, 5, true)).toBe(0);
    expect(learningPercent(3, 5, true)).toBe(60);
    expect(learningPercent(6, 5, true)).toBe(100);
  });
  it("distinguishes empty, denied and unavailable without exposing internal errors", async () => {
    expect(await dashboardRead(async () => [])).toEqual({ status: "AVAILABLE", data: [] });
    expect(await dashboardRead(async () => { throw new AccessError("PRIVATE"); })).toEqual({ status: "UNAUTHORIZED", data: null });
    expect(await dashboardRead(async () => { throw new NiceJobsUnavailable("PRIVATE"); })).toEqual({ status: "UNAVAILABLE", data: null });
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await dashboardRead(async () => { throw new Error("PRIVATE STACK OR TOKEN"); })).toEqual({ status: "UNAVAILABLE", data: null });
      expect(JSON.stringify(logging.mock.calls)).not.toContain("PRIVATE");
    } finally { logging.mockRestore(); }
  });
  it("renders real scoped navigation, account identity and a nonfabricated unread state", () => {
    const html = renderToStaticMarkup(createElement(DashboardShell, { base: "/sites/jobs/gateway", view: "worker-wallet", name: "Long Participant Name & Account", email: "test@example.invalid", unread: null, logout: createElement("button", {}, "Logout"), children: createElement("p", {}, "Scoped content") }));
    expect(html).toContain("Long Participant Name &amp; Account");
    expect(html).toContain('href="/sites/jobs/gateway?view=opportunities"');
    expect(html).toContain("unread status unavailable");
    expect(html).not.toContain("3 unread");
    expect(html).toContain('aria-label="Quick navigation"');
    expect(html).toContain('href="#nicejobs-main"');
    expect(html).toContain("My Workspace");
    expect(html).toContain("Marketplace");
    expect(html).toContain("Wallet");
    expect(html).not.toContain("nj-dashboard-sidebar");
  });
  it("never queries worker resources or production work for an applicant and bounds search", async () => {
    const list = vi.fn(async () => ({ records: [], nextCursor: null }));
    const day = vi.fn(), resources = vi.fn();
    const services = { account: { account: vi.fn() }, employee: { navigation: vi.fn(), day }, onboarding: { list }, applications: { list, opportunities: list }, knowledge: { list: resources }, operations: { list: vi.fn() } };
    const dashboard = createParticipantDashboard(services as unknown as Parameters<typeof createParticipantDashboard>[0]);
    expect((await dashboard.home("own-user", false)).stage).toBe("APPLICANT");
    expect(day).not.toHaveBeenCalled();
    expect(await dashboard.search("own-user", false, " ")).toBeNull();
    expect(await dashboard.search("own-user", false, "x".repeat(121))).toBeNull();
    const result = await dashboard.search("own-user", false, "  role  ");
    expect(result?.resources).toBeNull();
    expect(resources).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith("own-user", true, { search: "role", limit: 10 });
    expect(list).toHaveBeenCalledWith("own-user", { search: "role", limit: 10 });
  });
  it("names compact account and bottom navigation controls", () => {
    const html = renderToStaticMarkup(createElement(DashboardShell, { base: "/sites/jobs/gateway", view: "search", name: "Test Participant", email: "qa@example.invalid", search: "Advisor & training", unread: 0, logout: null, children: null }));
    expect(html).toContain('href="/sites/jobs/gateway?view=home"');
    expect(html).toContain('aria-label="Account menu for Test Participant"');
    const bottom = html.slice(html.indexOf('aria-label="Quick navigation"'));
    expect(bottom).not.toContain('class="sr-only"');
    expect(html).toContain('Notifications; 0 unread');
  });
  it("shows jobs-only public entry and redirects legacy internship catalogue URLs", async () => {
    const paths = { home: "/sites/jobs", login: "/sites/jobs/login", opportunities: "/sites/jobs/opportunities", signup: "/sites/jobs/signup", gateway: "/sites/jobs/gateway" };
    const site = { id: "jobs", theme: "jobs", name: "Nice Jobs", image: "/images/nice-jobs.jpg", eyebrow: "Test catalogue", description: "Synthetic catalogue", domain: "jobs.example.invalid", focus: [] };
    const requestPortal = async () => ({ site, paths });
    const landingOpportunities = vi.fn(async () => ({ records: [], nextCursor: null }));
    const { default: PortalLanding } = loadComponent<{ default: (props: { params: Promise<{ site: string }> }) => Promise<ReactNode> }>("src/app/sites/[site]/page.tsx", {
      "@/server/portals/request": { requestPortal }, "@/server/portals/sites": { portalSites: [] },
      "../labs-ui/landing": { LabsLanding: () => { throw new Error("Labs landing must not render for Nice Jobs"); } },
      "../jobs-ui/landing": { JobsLanding: ({ paths: landingPaths }: { paths: typeof paths }) => createElement("a", { href: landingPaths.opportunities }, "Explore Opportunities") },
      "@/server/nicejobs/applications": { applicationService: { publicOpportunities: landingOpportunities } },
      "@/server/nicejobs/input": { NiceJobsUnavailable },
    });
    const landing = renderToStaticMarkup(await PortalLanding({ params: Promise.resolve({ site: "jobs" }) }));
    expect(landing).toContain("Explore Opportunities");
    expect(landingOpportunities).toHaveBeenCalledWith({ kind: "jobs", limit: 3 });
    expect(landing).not.toContain("Internships");
    const publicOpportunities = vi.fn(async () => ({ records: [], nextCursor: null }));
    const { default: Opportunities, metadata } = loadComponent<{ default: (props: { params: Promise<{ site: string }>; searchParams: Promise<{ kind?: string }> }) => Promise<ReactNode>; metadata: { description: string } }>("src/app/sites/[site]/opportunities/page.tsx", {
      "@/server/portals/request": { requestPortal },
      "@/server/nicejobs/applications": { applicationService: { publicOpportunities } },
      "@/server/nicejobs/input": { NiceJobsUnavailable },
      "@/server/portals/session": { getPortalSession: async () => null },
      "@/app/app/nicejobs/opportunity-disclosure": { OpportunityDisclosure: () => null },
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error("Redirect " + url); } },
    });
    const catalogue = renderToStaticMarkup(await Opportunities({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({}) }));
    expect(publicOpportunities).toHaveBeenCalledWith({ kind: "jobs" });
    expect(catalogue).toContain("No jobs are accepting applications right now.");
    expect(catalogue).not.toContain("Internships");
    expect(metadata.description).not.toContain("internships");
    publicOpportunities.mockClear();
    await expect(Opportunities({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({ kind: "internships" }) })).rejects.toThrow("Redirect /sites/jobs/opportunities");
    expect(publicOpportunities).not.toHaveBeenCalled();
  });
  it("blocks duplicate notification submits until refresh but permits the opposite toggle afterward", async () => {
    const react = nativeRequire("react");
    let state: { ok?: boolean; message?: string; read?: boolean } = { ok: false };
    let pending = false;
    let submit: (previous: typeof state, form: FormData) => Promise<typeof state>;
    const refresh = vi.fn(), update = vi.fn(async () => ({ ok: true, message: "Notification updated." }));
    const { DashboardNotificationButton } = loadComponent<{ DashboardNotificationButton: ComponentType<{ id: string; realm: string; read: boolean }> }>("src/app/app/nicejobs/dashboard-notification-button.tsx", {
      react: { ...react, useActionState: (action: typeof submit) => { submit = action; return [state, () => {}, pending]; } },
      "next/navigation": { useRouter: () => ({ refresh }) },
      "./dashboard-actions": { dashboardNotificationAction: update },
    });
    const render = (read: boolean) => renderToStaticMarkup(createElement(DashboardNotificationButton, { id: "own", realm: "jobs", read }));
    expect(render(false)).not.toContain('disabled=""');
    state = await submit!(state, new FormData());
    expect(update).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledOnce();
    expect(render(false)).toContain('disabled=""');
    expect(render(true)).not.toContain('disabled=""');
    expect(render(true)).toContain("Mark unread");
    state = { ok: false, message: "Retry safely" }; pending = true;
    expect(render(true)).toContain('disabled=""');
    pending = false;
    expect(render(true)).not.toContain('disabled=""');
    expect(render(true)).toContain('role="alert"');
  });
  it("keeps denied training distinct and sends applicants without training to applications", async () => {
    const empty = { status: "AVAILABLE", data: { records: [] } };
    const home = vi.fn(async () => ({ stage: "APPLICANT", work: null, applications: empty, opportunities: empty, learning: { status: "UNAUTHORIZED", data: null } }));
    const { DashboardHome } = loadComponent<{ DashboardHome: (props: { userId: string; base: string; worker: boolean; name: string; timezone: string }) => Promise<ReactNode> }>("src/app/app/nicejobs/dashboard-home.tsx", {
      "@/lib/nicejobs-dashboard": { learningPercent }, "@/lib/timezone": { formatUserTime: () => "fixture time" },
      "@/server/nicejobs/participant-dashboard": { participantDashboard: { home } },
      "next/image": { __esModule: true, default: () => null },
    });
    const html = renderToStaticMarkup(await DashboardHome({ userId: "synthetic", base: "/sites/jobs/gateway", worker: false, name: "QA", timezone: "Asia/Kolkata" }));
    const day = html.slice(html.indexOf("My Day"), html.indexOf("Application Updates"));
    expect(day).toContain('href="/sites/jobs/gateway?view=my-applications"');
    expect(day).toContain("These records are not authorized for your account.");
    expect(day).not.toContain("Browse approved opportunities");
  });
  it("renders configured zero progress without dangling unconfigured labels or invented completion", async () => {
    const empty = { status: "AVAILABLE", data: { records: [] } };
    const track = { id: "track", title: "Synthetic learning", status: "ENROLLED", reference: "fixture", orientation: { completed: 0, required: 2 }, ojt: { completed: 0, required: 0 }, configuration: { orientation: true, ojt: false }, readinessStatus: "PENDING", reviewer: "Unassigned" };
    const { DashboardHome } = loadComponent<{ DashboardHome: (props: { userId: string; base: string; worker: boolean; name: string; timezone: string }) => Promise<ReactNode> }>("src/app/app/nicejobs/dashboard-home.tsx", {
      "@/lib/nicejobs-dashboard": { learningPercent }, "@/lib/timezone": { formatUserTime: () => "fixture time" },
      "@/server/nicejobs/participant-dashboard": { participantDashboard: { home: async () => ({ stage: "SELECTED_CANDIDATE", work: null, applications: empty, opportunities: empty, learning: { status: "AVAILABLE", data: { records: [track] } } }) } },
      "next/image": { __esModule: true, default: () => null },
    });
    const html = renderToStaticMarkup(await DashboardHome({ userId: "synthetic", base: "/sites/jobs/gateway", worker: false, name: "QA", timezone: "Asia/Kolkata" }));
    expect(html).toContain('id="track-orientation" max="100" value="0"');
    expect(html).toContain("Required activities not configured.");
    expect(html).not.toContain('for="track-ojt"');
    expect(html).not.toContain('id="track-ojt"');
    expect(html).toContain('href="/sites/jobs/gateway?view=my-day"');
  });
  it("filters notification projection to current company scopes and fails closed when scope is absent", async () => {
    const navigation = vi.fn(async () => ({ notificationOrganizationIds: ["own-company"] }));
    const list = vi.fn(async () => [{ id: "own", organizationId: "own-company" }, { id: "sibling", organizationId: "other-company" }]);
    const dashboard = createParticipantDashboard({ employee: { navigation }, operations: { list } } as unknown as Parameters<typeof createParticipantDashboard>[0]);
    expect((await dashboard.notifications("session-user", "unread")).data?.map(n => n.id)).toEqual(["own"]);
    expect(list).toHaveBeenCalledWith("session-user", "notifications", { read: "unread" });
    navigation.mockResolvedValue({ notificationOrganizationIds: [] }); list.mockClear();
    expect((await dashboard.notifications("session-user")).status).toBe("UNAUTHORIZED");
    expect(list).not.toHaveBeenCalled();
  });
  it("binds notification writes to the session, denies foreign IDs and rechecks current visibility", async () => {
    let session: { userId: string } | null = { userId: "session-user" };
    const notifications = vi.fn(async () => ({ status: "AVAILABLE", data: [{ id: "own" }] }));
    const markRead = vi.fn(async () => {}), revalidatePath = vi.fn();
    const { dashboardNotificationAction } = loadComponent<{ dashboardNotificationAction: (state: object, form: FormData) => Promise<{ ok: boolean; message: string }> }>("src/app/app/nicejobs/dashboard-actions.ts", {
      "next/headers": { headers: async () => ({ get: () => "localhost:3009" }) },
      "next/cache": { revalidatePath }, "next/navigation": { redirect: () => { throw new Error("Login required"); } },
      "@/server/auth/guards": { requireSession: async () => session },
      "@/server/portals/session": { getPortalSession: async () => session },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { login: "/sites/jobs/login" } }) },
      "@/server/portals/sites": { siteByHost: () => null },
      "@/server/security/origin": { validateActionOrigin: () => {} },
      "@/server/security/rate-limit": { consumeSecurityBudget: async () => {}, securityKey: () => "test-budget" },
      "@/server/domain/operations-service": { operationsService: { markRead } },
      "@/server/security/diagnostics": { safeDiagnostic: () => {} },
      "@/server/authorization/engine": { AccessError },
      "@/server/nicejobs/participant-dashboard": { participantDashboard: { notifications } },
    });
    const form = new FormData(); form.set("realm", "jobs"); form.set("id", "foreign"); form.set("read", "true"); form.set("userId", "forged-user");
    expect((await dashboardNotificationAction({}, form)).ok).toBe(false);
    expect(markRead).not.toHaveBeenCalled();
    form.set("id", "own");
    expect((await dashboardNotificationAction({}, form)).ok).toBe(true);
    expect(markRead).toHaveBeenCalledWith("session-user", "own", true);
    expect(notifications).toHaveBeenCalledWith("session-user");
    expect(revalidatePath).toHaveBeenCalledWith("/sites/jobs/gateway");
    notifications.mockResolvedValue({ status: "UNAUTHORIZED", data: [] }); markRead.mockClear();
    expect((await dashboardNotificationAction({}, form)).ok).toBe(false);
    expect(markRead).not.toHaveBeenCalled();
    session = null;
    await expect(dashboardNotificationAction({}, form)).rejects.toThrow("Login required");
  });
});
