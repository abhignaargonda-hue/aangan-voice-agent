import { NextResponse } from "next/server";
import { processCall, receiveCall } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

// Dashboard-only (behind the password): run a transcript through the same pipeline
// as a live call. Marked as a test, so it never reaches HubSpot.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const transcript = String(body.transcript ?? "").trim();
  if (!transcript) return NextResponse.json({ error: "transcript required" }, { status: 400 });

  const startedAt = body.started_at ? new Date(body.started_at).toISOString() : new Date().toISOString();
  const lines = transcript.split("\n").length;
  const { row } = await receiveCall(
    {
      call_id: `sim-${crypto.randomUUID()}`,
      started_at: startedAt,
      duration_seconds: Number(body.duration_seconds) || lines * 15,
      caller_phone: String(body.caller_phone ?? "+91 90000 00000"),
      transcript,
    },
    { isTest: true },
  );
  const processed = await processCall(row.id);
  return NextResponse.json({ ok: true, id: processed.id, route: processed.route, error: processed.processing_error });
}
