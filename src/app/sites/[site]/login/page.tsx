import type { Metadata } from "next";
import { requestPortal } from "@/server/portals/request";
import { PortalLoginForm } from "./form";
import { JobsEmailAuthForm } from "../email-auth-form";
export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> { const { site } = await requestPortal((await params).site); return { title: `Sign in | ${site.name}`, robots: { index: false, follow: false } }; }
export default async function PortalLogin({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ versionId?: string }> }) { const { site, paths } = await requestPortal((await params).site); const query = await searchParams; const versionId = site.id === "jobs" && typeof query.versionId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(query.versionId) ? query.versionId : undefined; return site.id === "jobs" ? <JobsEmailAuthForm paths={paths} versionId={versionId} /> : <PortalLoginForm site={site} home={paths.home} versionId={versionId} />; }
