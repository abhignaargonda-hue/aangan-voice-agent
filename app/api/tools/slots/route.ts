import { NextResponse } from "next/server";
import { verifyVaani } from "@/lib/auth";
import { getSlots, speakSlot } from "@/lib/calcom";
import { integrations } from "@/lib/config";

export const runtime = "nodejs";

// Agent tool: get_consultation_slots. Returns two available slots to offer the caller.
// Body (all optional): { "preferred_date": "YYYY-MM-DD", "part_of_day": "morning|afternoon|evening" }
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyVaani(req, raw)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const body = safeJson(raw);
  const args = body.args ?? body.arguments ?? body.parameters ?? body;

  if (!integrations().calcom) {
    return NextResponse.json({
      available: false,
      say: "I'm not able to see the designers' calendar right now. A designer will call you to fix a time that suits you.",
      booking_status: "designer_to_schedule",
    });
  }

  try {
    const tomorrow = new Date(Date.now() + 18 * 3600_000);
    const from = args.preferred_date ? new Date(`${args.preferred_date}T00:00:00+05:30`) : tomorrow;
    let slots = await getSlots((from > tomorrow ? from : tomorrow).toISOString(), 10);
    const part = String(args.part_of_day ?? "").toLowerCase();
    if (part) {
      const hourOf = (s: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date(s)));
      const want = (h: number) => (part.startsWith("morn") ? h < 12 : part.startsWith("after") ? h >= 12 && h < 16 : part.startsWith("even") ? h >= 16 : true);
      const filtered = slots.filter((s) => want(hourOf(s)));
      if (filtered.length) slots = filtered;
    }
    // Two slots on different days where possible.
    const picked: string[] = [];
    for (const s of slots) {
      if (picked.length === 2) break;
      if (!picked.length || s.slice(0, 10) !== picked[0].slice(0, 10)) picked.push(s);
    }
    if (picked.length < 2 && slots[1]) picked.push(slots.find((s) => !picked.includes(s))!);
    if (!picked.length) {
      return NextResponse.json({ available: false, say: "There are no open slots in the next few days. A designer will call you to fix a time.", booking_status: "designer_to_schedule" });
    }
    return NextResponse.json({
      available: true,
      slots: picked.map((s) => ({ start: s, spoken: speakSlot(s) })),
      say: `I can offer ${picked.map(speakSlot).join(" or ")}. Which suits you better?`,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ available: false, say: "I can't reach the calendar just now. A designer will call you to fix a time.", booking_status: "designer_to_schedule" });
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s) ?? {}; } catch { return {}; }
}
