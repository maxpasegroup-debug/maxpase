"use client";
import { useState } from "react";
import { deleteEntry } from "./actions";
export function DeleteEntryButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button type="button" className="button secondary" onClick={() => setConfirming(true)}>Delete</button>;
  return <form action={deleteEntry} onSubmit={event => { if (!window.confirm("Delete this recorded entry? Its change history will be retained.")) event.preventDefault(); }}>
    <input type="hidden" name="id" value={id}/><label>Reason <input name="reason" required minLength={3} maxLength={300}/></label><button className="button secondary">Confirm delete</button><button type="button" onClick={() => setConfirming(false)}>Cancel</button>
  </form>;
}
