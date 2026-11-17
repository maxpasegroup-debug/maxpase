"use client";
import { useActionState } from "react";
import { saveStartupIntake, type IntakeActionState } from "./actions";
const initial: IntakeActionState = {};
type Props = { brandId: string; programs: { id: string; name: string; status: string; code: string | null; capacity: number | null }[]; centres: { id: string; name: string; city: string | null; region: string | null }[]; batch?: { id: string; name: string; programId: string; status: string; startDate: Date | null; endDate: Date | null; capacity: number | null; locationId: string | null; updatedAt: Date } };
const dateValue = (date: Date | null | undefined, end = false) => date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}` : end ? "" : "";
export function IntakeForm({ brandId, programs, centres, batch }: Props) {
  const [state, action, pending] = useActionState(saveStartupIntake.bind(null, brandId), initial);
  const startDate = dateValue(batch?.startDate), endDate = dateValue(batch?.endDate);
  return <form action={action} className="startup-intake-form">
    {batch && <><input type="hidden" name="id" value={batch.id}/><input type="hidden" name="version" value={batch.updatedAt.toISOString()}/></>}
    <label>Program<select name="programId" required defaultValue={batch?.programId ?? programs[0]?.id ?? ""}><option value="" disabled>Select an existing PBA program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.code === "PBA_30_DAYS" ? "PBA Starter · 30 days" : p.code === "PBA_180_DAYS" ? "PBA Pro · 180 days" : p.name} · {p.status}</option>)}</select></label>
    <label>Intake name<input name="name" required minLength={2} maxLength={160} defaultValue={batch?.name ?? ""} placeholder="Use the approved intake name"/></label>
    <div className="startup-intake-grid"><label>Applications open from<input type="date" name="startDate" required defaultValue={startDate}/></label><label>Applications close on<input type="date" name="endDate" required defaultValue={endDate}/></label></div>
    <label>Capacity (optional)<input type="number" name="capacity" min="1" max="100000" defaultValue={batch?.capacity ?? ""} placeholder="No limit recorded"/></label>
    <label>Published centre (optional)<select name="locationId" defaultValue={batch?.locationId ?? ""}><option value="">No centre selected</option>{centres.map(c=><option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ""}{c.region ? `, ${c.region}` : ""}</option>)}</select></label>
    <label className="startup-intake-open"><input type="checkbox" name="open" defaultChecked={batch?.status === "ACTIVE"}/> Open this intake for applications</label>
    <p className="muted">Opening is allowed only after the existing PBA program is active. Public availability also checks the dates, centre status and remaining capacity.</p>
    {state.error && <p role="alert" className="startup-intake-error">{state.error}</p>}{state.success && <p role="status" className="startup-intake-success">{state.success}</p>}
    <button className="button" disabled={pending || programs.length === 0}>{pending ? "Saving intake…" : batch ? "Save intake" : "Create intake"}</button>
  </form>;
}
