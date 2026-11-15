import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrSelf } from "@/server/skillcity/hr-self";

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const result = await hrSelf.updateProfile(session.userId, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Check the profile details and contact information." }, { status: 400 });
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "Your profile could not be saved. Try again." }, { status: 500 });
  }
}
