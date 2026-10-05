import { requireSession } from "@/server/auth/guards";
import { getPermissionGrantsForUser } from "@/server/authorization/service";
import { foundationalSiaTools } from "@/server/sia/contracts";

export default async function FoundationPage() {
  const session = await requireSession();
  const grants = await getPermissionGrantsForUser(session.userId);

  return (
    <>
      <section>
        <p className="eyebrow">Phase 01</p>
        <h1>MAXPASE GROUP foundation</h1>
        <p className="muted">
          The system root is MAXPASE GROUP. Company implementations such as AIRA Skill City sit below
          the shared MAXPASE OS and SIA governance layer.
        </p>
      </section>

      <section className="section foundation-grid" aria-label="Foundation modules">
        <article className="foundation-card">
          <h3>Organization model</h3>
          <p className="muted">Groups, companies, departments, teams, memberships, brands, products, projects, goals, and tasks are separate concepts.</p>
        </article>
        <article className="foundation-card">
          <h3>Authorization model</h3>
          <p className="muted">Roles collect permissions. Permissions are evaluated with organization scope at the server boundary.</p>
        </article>
        <article className="foundation-card">
          <h3>SIA boundary</h3>
          <p className="muted">SIA starts as a controlled executive layer with tool contracts, permissions, approvals, and auditability.</p>
        </article>
      </section>

      <section className="section">
        <h2>System hierarchy</h2>
        <div className="system-map" aria-label="MAXPASE hierarchy">
          <div>MAXPASE GROUP</div>
          <div>MAXPASE OS</div>
          <div>SIA - MAXPASE GROUP Virtual CEO</div>
          <div>Company OSs</div>
          <div>Company operations</div>
        </div>
      </section>

      <section className="section foundation-grid">
        <article className="empty-state">
          <h3>Active permission grants</h3>
          <p className="muted">{grants.length} server-derived grants available for this account.</p>
        </article>
        <article className="empty-state">
          <h3>SIA tools registered</h3>
          <p className="muted">{foundationalSiaTools.length} foundational tool contracts defined.</p>
        </article>
        <article className="empty-state">
          <h3>Business modules</h3>
          <p className="muted">Operational modules are intentionally deferred to later phases.</p>
        </article>
      </section>
    </>
  );
}
