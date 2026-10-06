import { UserTime } from "@/components/ui/user-time";
import { domainEvidence } from "@/server/group/boss-overview";

export function DomainEvidence({ website, metadata, people, calculatedAt }: { website: string | null; metadata: string | null; people: { id: string; name: string }[]; calculatedAt: Date }) {
  const data = domainEvidence(website, metadata, calculatedAt);
  if (!data.hostname) return <span>Not configured</span>;
  const check = (entry?: { source: string; checkedAt: string }) => entry && <><br/>Source: {entry.source}<br/>Recorded check: <UserTime value={entry.checkedAt}/></>;
  return <><span>{data.hostname}</span><details className="boss-domain-evidence"><summary>Ownership, routing & certificate evidence</summary><dl><dt>Responsible person</dt><dd>{data.evidence?.responsiblePersonId ? people.find(p => p.id === data.evidence!.responsiblePersonId)?.name ?? "Outside visible people records" : "Not recorded"}</dd><dt>Domain ownership</dt><dd>{data.ownership}{check(data.evidence?.ownership)}</dd><dt>Application route</dt><dd>{data.route ? `${data.route} / CONFIGURED` : "NOT CONFIGURED"}<br/>Live routing: {data.routing}{check(data.evidence?.routing)}</dd><dt>Certificate verification</dt><dd>{data.certificate}{check(data.evidence?.certificate)}{data.evidence?.certificate && <><br/>Recorded issuer: {data.evidence.certificate.issuer}<br/>Recorded validity: <UserTime value={data.evidence.certificate.validUntil}/></>}</dd></dl><p>The company column is a business association, not proof of domain registration. Recorded checks are attestations; application routing does not establish DNS or TLS readiness.</p></details></>;
}
