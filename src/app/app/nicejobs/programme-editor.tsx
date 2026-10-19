"use client";
import { useState } from "react";
import { ApplicationCommand } from "./application-form";
import { emptyProgramme, programmeConfiguration, type ProgrammeConfiguration } from "@/server/nicejobs/programme-configuration";

export function ProgrammeEditor({ realm, versionId, revision, initial, accounts }: { realm: string; versionId: string; revision: number; initial: Record<string, unknown> | null; accounts: { id: string; displayName: string }[] }) {
  const parsed = programmeConfiguration.safeParse(initial?.programmeSetup);
  const [setup, setSetup] = useState<ProgrammeConfiguration>(parsed.success ? parsed.data : emptyProgramme);
  const update = (key: keyof ProgrammeConfiguration, value: string | null) => setSetup(previous => ({ ...previous, [key]: value }));
  return <ApplicationCommand realm={realm} operation="CONFIGURE" versionId={versionId} revision={revision} label="Save programme setup">
    <input type="hidden" name="configuration" value={JSON.stringify({ ...initial, schemaVersion: 1, programmeSetup: setup })} />
    <fieldset><legend>Responsible accounts</legend>{([
      ["managerUserId", "Reporting manager account"], ["publicationReviewerUserId", "Publication reviewer account"], ["ojtReviewerUserId", "OJT reviewer account"], ["readinessReviewerUserId", "Readiness reviewer account"]
    ] as const).map(([key, label]) => <label key={key}>{label}<select value={setup[key] ?? ""} onChange={event => update(key, event.target.value || null)}>
      <option value="">Not nominated</option>{setup[key] && !accounts.some(account => account.id === setup[key]) && <option value={setup[key]!}>Saved account unavailable</option>}{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}
    </select></label>)}</fieldset>
    <fieldset><legend>Approval evidence</legend>{([
      ["engagementApproval", "Engagement approval reference"], ["compensationApproval", "Compensation, incentives and payment terms approval reference"], ["policyApproval", "Legal / policy review reference for the current versions"]
    ] as const).map(([key, label]) => <label key={key}>{label}<textarea maxLength={1000} value={setup[key] ?? ""} onChange={event => update(key, event.target.value || null)} /></label>)}</fieldset>
    <label>Training outcomes and readiness expectations<textarea maxLength={4000} value={setup.trainingOutcomes} onChange={event => update("trainingOutcomes", event.target.value)} /></label>
  </ApplicationCommand>;
}
