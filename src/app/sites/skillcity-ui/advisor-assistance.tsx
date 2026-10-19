import { prisma } from "@/server/db";
import { createSiaService } from "@/server/sia/service";
import { AccessError } from "@/server/authorization/engine";

export async function AdvisorAssistance({ userId, organizationId }: { userId: string; organizationId: string }) {
  const identities = await prisma.siaIdentity.findMany({ where: { status: "ACTIVE", tools: { some: { key: "get_advisor_day", enabled: true, permissionKey: "labs.sales.self" } } }, select: { id: true, name: true }, take: 10 });
  for (const identity of identities) {
    try {
      const response = await createSiaService(prisma).preview(userId, { siaId: identity.id, organizationId }, "get_advisor_day");
      return <section className="sc-section"><h2>{identity.name} daily briefing</h2><p>Read-only draft from your assigned follow-ups. Verify before acting.</p><ul>{response.actions.map((action, index) => <li key={index}>{action}</li>)}</ul>{response.recommendations.length > 0 && <details><summary>Draft coaching</summary><ul>{response.recommendations.map((item, index) => <li key={index}>{item.observation}: {item.recommendation}</li>)}</ul></details>}<p>Current page only; no customer message or business decision was executed.</p></section>;
    } catch (error) { if (!(error instanceof AccessError)) throw error; }
  }
  return <section className="sc-section"><h2>SIA daily briefing</h2><p>Unavailable until an authorized SIA identity, read-only advisor tool and matching grants are configured. Your assigned follow-up queue remains available.</p></section>;
}
