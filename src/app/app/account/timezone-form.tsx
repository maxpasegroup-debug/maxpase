"use client";
import { useActionState } from "react";
import { Save } from "lucide-react";
import { timezoneOptions } from "@/lib/timezone";
import { saveTimezone } from "./actions";
export function TimezoneForm({ timezone }: { timezone: string }) {
  const [state, action, pending] = useActionState(saveTimezone, { message: "", ok: false });
  return <form action={action} className="account-preferences"><label htmlFor="account-timezone">Timezone</label><select id="account-timezone" name="timezone" defaultValue={timezone}>{!timezoneOptions.some(t => t.value === timezone) && <option value={timezone}>{timezone}</option>}{timezoneOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select><button className="button" disabled={pending}><Save size={18}/>{pending ? "Saving" : "Save"}</button><p role="status" className={state.ok ? "muted" : "error"}>{state.message}</p></form>;
}
