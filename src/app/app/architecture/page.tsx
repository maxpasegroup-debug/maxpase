export default function ArchitecturePage() {
  return (
    <section>
      <p className="eyebrow">Constitution</p>
      <h1>Architecture source of truth</h1>
      <p className="muted">
        Phase 01 records canonical decisions in docs/architecture. Future work should extend these
        boundaries rather than recentering the system around any single company implementation.
      </p>
      <div className="section foundation-grid">
        <article className="foundation-card">
          <h3>Group first</h3>
          <p className="muted">MAXPASE GROUP is the parent layer for all companies and future business units.</p>
        </article>
        <article className="foundation-card">
          <h3>Company independent</h3>
          <p className="muted">AIRA Skill City, TEARN, TOPRANK AI, and future entities remain independently modeled.</p>
        </article>
        <article className="foundation-card">
          <h3>Controlled intelligence</h3>
          <p className="muted">SIA acts through authorized, auditable tools rather than arbitrary database access.</p>
        </article>
      </div>
    </section>
  );
}
