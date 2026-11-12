import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  event: z.enum(["journey_view", "skip_to_brands", "portals_reached", "brand_selected"]),
  brand: z.enum(["startup", "labs", "jobs"]).optional()
}).strict().superRefine((value, context) => {
  if (value.event === "brand_selected" && !value.brand) context.addIssue({ code: "custom", message: "Brand is required for a selection." });
  if (value.event !== "brand_selected" && value.brand) context.addIssue({ code: "custom", message: "Brand is only accepted for a selection." });
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  let originHost = "";
  try { originHost = origin ? new URL(origin).host : ""; } catch { originHost = ""; }
  if (!originHost || originHost !== request.nextUrl.host) return Response.json({ error: "Invalid origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "JSON required." }, { status: 415 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1024) return Response.json({ error: "Request too large." }, { status: 413 });
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 1024) return Response.json({ error: "Request too large." }, { status: 413 });
    input = JSON.parse(body);
  } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Invalid event." }, { status: 400 });

  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const { event, brand } = parsed.data;
  await prisma.airaJourneyDailyMetric.upsert({
    where: { day_eventType_brand: { day, eventType: event, brand: brand ?? "" } },
    create: { day, eventType: event, brand: brand ?? "", count: 1 },
    update: { count: { increment: 1 } }
  });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
