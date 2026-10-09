import { after, NextResponse } from "next/server";
import { verifyVaani } from "@/lib/auth";
import { processCall, receiveCall } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vaani posts the end-of-call record here. We store it and reply at once (Vaani's
// webhook timeout is short), then structure and notify in the background.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyVaani(req, raw)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Vaani sends many events per call; only `call_postprocessing` carries the
  // transcript and extracted fields. Acknowledge the rest without storing them.
  const event = String(payload?.event ?? payload?.type ?? payload?.event_type ?? "");
  if (event && !/(postprocessing|completed|analy[sz]ed|post_call|call_record)/i.test(event)) {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const { row, duplicate } = await receiveCall(payload);
  if (!duplicate) {
    after(async () => {
      try {
        await processCall(row.id);
      } catch (e) {
        console.error("processCall failed", row.id, e);
      }
    });
  }
  return NextResponse.json({ ok: true, id: row.id, duplicate });
}
