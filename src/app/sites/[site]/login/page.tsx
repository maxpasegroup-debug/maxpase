import type { Metadata } from "next";
import { requestPortal } from "@/server/portals/request";
import { PortalLoginForm } from "./form";
export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> { const { site } = await requestPortal((await params).site); return { title: `Sign in | ${site.name}`, robots: { index: false, follow: false } }; }
export default async function PortalLogin({ params }: { params: Promise<{ site: string }> }) { const { site, paths } = await requestPortal((await params).site); return <PortalLoginForm site={site} home={paths.home} />; }
