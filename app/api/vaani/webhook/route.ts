import { after, NextResponse } from "next/server";
import { verifyVaani } from "@/lib/auth";
import { normalizeVaaniPayload } from "@/lib/normalize";
import { processCall, receiveCall } from "@/lib/pipeline";
import { saveCallEvent } from "@/lib/store";

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
  const hasTranscript = /"(transcript|transcription|transcript_text)"\s*:\s*("[^"]{20,}|\[)/.test(raw);
  console.log(`[vaani] event=${event || "(none)"} transcript=${hasTranscript} keys=${Object.keys(payload ?? {}).join(",")}`);
  if (!hasTranscript && !/(postprocessing|completed|analy[sz]ed|post_call|call_record)/i.test(event)) {
    // Early events (call_started, user_picked_up…) may carry the caller's number,
    // which the end-of-call event does not. Keep it for that call.
    const { partial } = normalizeVaaniPayload(payload);
    if (partial.call_id) await saveCallEvent(partial.call_id, event, partial.caller_phone ?? "", payload).catch(() => {});
    return NextResponse.json({ ok: true, noted: event || "no transcript" });
  }

  // ?test=1 marks the call as a test: it is labelled on the dashboard and never sent to HubSpot.
  const isTest = new URL(req.url).searchParams.get("test") === "1";
  const { row, duplicate } = await receiveCall(payload, { isTest });
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
