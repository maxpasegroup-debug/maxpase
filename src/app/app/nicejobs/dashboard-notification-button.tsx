"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail } from "lucide-react";
import { dashboardNotificationAction } from "./dashboard-actions";
export function DashboardNotificationButton({ id, realm, read }: { id: string; realm: string; read: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: { message?: string; ok?: boolean; read?: boolean }, form: FormData) => { const result = await dashboardNotificationAction(previous, form); if (result.ok) router.refresh(); return { ...result, read }; }, { ok: false, message: "", read });
  const waitingForRefresh = state.ok && state.read === read;
  return <form action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="realm" value={realm} /><input type="hidden" name="read" value={String(!read)} /><button disabled={pending || waitingForRefresh} className="nj-dashboard-button">{read ? <Mail size={16} /> : <Check size={16} />}{pending ? "Saving…" : read ? "Mark unread" : "Mark read"}</button>{state.message && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}</form>;
}
