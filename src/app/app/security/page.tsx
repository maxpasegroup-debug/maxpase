export default function SecurityPage() {
  return (
    <section>
      <p className="eyebrow">Security</p>
      <h1>Secure defaults</h1>
      <p className="muted">
        Authentication, authorization, auditability, scoped permissions, and explicit migrations are
        foundational requirements for every later phase.
      </p>
      <div className="section foundation-grid">
        <article className="foundation-card">
          <h3>Authentication</h3>
          <p className="muted">Password hashes use bcrypt. Sessions use HTTP-only cookies and server validation.</p>
        </article>
        <article className="foundation-card">
          <h3>Authorization</h3>
          <p className="muted">UI visibility is not security. Server-side permission checks are the enforcement point.</p>
        </article>
        <article className="foundation-card">
          <h3>Audit trail</h3>
          <p className="muted">Important actor, entity, scope, result, and metadata context is recorded centrally.</p>
        </article>
      </div>
    </section>
  );
}
