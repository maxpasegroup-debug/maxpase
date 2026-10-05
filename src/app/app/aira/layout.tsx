import Link from "next/link";
import { requireSession } from "@/server/auth/guards";
import { airaService } from "@/server/domain/aira-service";
import { AccessError } from "@/server/authorization/engine";
import { companyLabels } from "./labels";
export default async function AiraLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  try {
    const w = await airaService.workspace(session.userId);
    return <><header className="company-header"><p className="eyebrow">MAXPASE GROUP / Company</p><h1>AIRA Skill City</h1><p>{w.company.legalName ?? w.company.name} <span className="status">{w.company.status}</span></p></header><nav className="company-navigation" aria-label="AIRA navigation"><Link href="/app/aira">Overview</Link>{w.navigation.map(k => <Link key={k} href={`/app/aira/${k}`}>{companyLabels[k]}</Link>)}</nav>{children}</>;
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <section className="business-empty"><h1>AIRA Skill City</h1><p role="alert">This company is not available with your current access.</p><Link href="/app/business/companies">Companies</Link></section>;
  }
}
