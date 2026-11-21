"use server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { createSession } from "@/server/auth/session";
import { AccessError } from "@/server/authorization/engine";
import { brandWorkspaceInviteService } from "@/server/auth/brand-workspace-invite";

export type BrandActivationState = { error?: string };
export async function activateBrandEmployee(_state: BrandActivationState, form: FormData): Promise<BrandActivationState> {
  let userId: string;
  try {
    const result = await brandWorkspaceInviteService.activate({ challengeId: String(form.get("challengeId") ?? ""), code: String(form.get("code") ?? ""), password: String(form.get("password") ?? ""), confirmPassword: String(form.get("confirmPassword") ?? "") });
    userId = result.userId;
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check your invitation code and password. Use a password of at least 12 characters." };
    return { error: "Account setup could not be completed. Request a new invitation from the MAXPASE Boss." };
  }
  await createSession(userId);
  redirect("/app");
}
