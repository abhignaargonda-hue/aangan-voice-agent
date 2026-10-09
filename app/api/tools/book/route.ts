import { NextResponse } from "next/server";
import { verifyVaani } from "@/lib/auth";
import { createBooking, speakSlot } from "@/lib/calcom";
import { integrations } from "@/lib/config";
import { insertBooking } from "@/lib/store";

export const runtime = "nodejs";

// Agent tool: book_consultation. Only for QUALIFIED / QUALIFIED_FLAGGED callers.
// Body: { "slot_start": ISO, "caller_name", "caller_phone", "consultation_type": "site_visit|studio",
//         "call_id", "notes" }
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyVaani(req, raw)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  let body: any = {};
  try { body = JSON.parse(raw) ?? {}; } catch {}
  const a = body.args ?? body.arguments ?? body.parameters ?? body;

  const fallback = {
    booked: false,
    booking_status: "designer_to_schedule",
    say: "I wasn't able to lock that slot in. A designer will call you to fix a time that suits you.",
  };
  if (!a.slot_start || !integrations().calcom) return NextResponse.json(fallback);

  const type = a.consultation_type === "site_visit" || a.consultation_type === "studio" ? a.consultation_type : null;
  try {
    const b = await createBooking({
      start: a.slot_start,
      name: String(a.caller_name ?? ""),
      phone: String(a.caller_phone ?? ""),
      type,
      notes: String(a.notes ?? ""),
      callId: String(a.call_id ?? body.call_id ?? ""),
    });
    await insertBooking({
      call_id: String(a.call_id ?? body.call_id ?? "") || null,
      caller_phone: String(a.caller_phone ?? "") || null,
      caller_name: String(a.caller_name ?? "") || null,
      slot: b.start,
      type,
      calcom_uid: b.uid || null,
    });
    return NextResponse.json({
      booked: true,
      booking_status: "booked",
      slot: b.start,
      say: `You're booked for ${speakSlot(b.start)}${type === "site_visit" ? ", at your site" : type === "studio" ? ", at the studio" : ""}. The consultation is free, with no obligation.`,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(fallback);
  }
}
