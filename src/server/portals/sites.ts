import { validateActionOrigin } from "../security/origin";
export const portalSites = [
  { id: "startup", name: "AIRA Startup School", domain: "airastartupskool.com", divisionSlug: "aira-startup-school", brandSlug: "startup-school", cookie: "aira_startup_session", theme: "startup", image: "/images/startup-school.jpg", eyebrow: "IDEAS INTO ENTERPRISE", description: "A place for curious minds and ambitious founders. Learn, experiment and take your next step.", focus: ["Entrepreneurship", "Practical learning", "Founder projects"] },
  { id: "labs", name: "AIRA Labs", domain: "airalabs.online", divisionSlug: "aira-labs", brandSlug: "aira-labs", cookie: "aira_labs_session", theme: "labs", image: "/images/aira-labs.jpg", eyebrow: "CURIOSITY MEETS CREATION", description: "Explore ideas through technology, experimentation and collaborative projects.", focus: ["Applied technology", "Experimentation", "Collaborative projects"] },
  { id: "jobs", name: "Nice Jobs", domain: "nicejobs.online", divisionSlug: "aira-career-hub", brandSlug: "nice-jobs", cookie: "nice_jobs_session", theme: "jobs", image: "/images/nice-jobs.jpg", eyebrow: "YOUR NEXT CHAPTER", description: "Bring your skills and ambitions together. Take the next step in your career journey.", focus: ["Career development", "Skills in practice", "Professional growth"] }
  ,{ id: "skillcity", name: "AIRA Skill City", domain: "airaskillcity.com", divisionSlug: "aira-skill-city", brandSlug: "aira-skill-city", cookie: "aira_skillcity_session", theme: "skillcity", image: "/images/group-workspace.jpg", eyebrow: "LEARN. CREATE. GROW.", description: "Discover an ecosystem of practical learning, entrepreneurship, technology and career development.", focus: ["Skills and learning", "Enterprise and innovation", "Careers and opportunity"] }
] as const;
export type PortalId = typeof portalSites[number]["id"];
export type PortalSite = typeof portalSites[number];
export function siteById(id: string): PortalSite | undefined { return portalSites.find(s => s.id === id); }
export function hostName(raw: string | null): string | null {
  if (!raw || !/^[a-zA-Z0-9.:[\]-]+$/.test(raw)) return null;
  try { return new URL("http://" + raw).hostname.toLowerCase(); } catch { return null; }
}
export function siteByHost(host: string | null) { const name = hostName(host); return portalSites.find(s => name === s.domain || name === "www." + s.domain); }
export function localHost(host: string | null) { return ["localhost", "127.0.0.1", "[::1]"].includes(hostName(host) ?? ""); }
export function portalPaths(site: PortalSite, local = false) { const base = local ? `/sites/${site.id}` : ""; return { home: base || "/", login: base + "/login", gateway: base + "/gateway" }; }
export function portalHostAllowed(site: PortalSite, host: string | null, development: boolean) { return siteByHost(host)?.id === site.id || development && localHost(host); }
export function validatePortalOrigin(site: PortalSite, host: string | null, origin: string | null, development: boolean) {
  if (!portalHostAllowed(site, host, development)) throw new Error("Invalid gateway host");
  validateActionOrigin(origin, host, localHost(host) ? undefined : "https://" + host!.toLowerCase());
}
