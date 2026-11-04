import type { siaService } from "@/server/sia/service";

type Turn = Awaited<ReturnType<typeof siaService.transcript>>[number];

export function TaraTranscript({ turns }: { turns: Turn[] }) {
  return <section aria-label="TARA conversation history"><h3>Recent conversation</h3>
    {!turns.length && <p>No TARA conversation has been recorded for this job yet.</p>}
    <ol className="nj-history">{turns.map(turn => <li key={turn.id}>
      <p><strong>You:</strong> {turn.prompt}</p>
      <div><strong>TARA guidance:</strong><ul>{turn.response.facts.map((fact, index) => <li key={`fact-${index}`}>{fact.label}: {fact.value ?? "Unavailable"}</li>)}{turn.response.actions.map((action, index) => <li key={`action-${index}`}>{action}</li>)}</ul>{turn.response.limitations.map((limit, index) => <p key={index}>{limit}</p>)}</div>
      <small>{turn.at.toISOString()} UTC / {turn.provider}</small>
    </li>)}</ol>
    <p>TARA reads authorized records and prepares guidance. A manager makes employment, disciplinary and pay decisions.</p>
  </section>;
}
