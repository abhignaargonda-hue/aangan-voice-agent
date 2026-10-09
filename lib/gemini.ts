// Gemini Flash: turns the end-of-call transcript into clean fields, a short summary
// and the designer handoff note. It never decides policy on its own; the route is
// re-checked by lib/rubric.ts.

import { config } from "./config";
import type { CallRecord } from "./types";

export interface GeminiResult {
  fields: Partial<CallRecord>;
  summary: string;
  handoff_note: string;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM = `You structure phone-call records for Aangan Studio, an interior design studio in Pune
(homes and small offices; 14 designers). A voice agent answered the call. You read the transcript and
return ONE JSON object. Use only what was said in the transcript or given in "Known fields". Never invent
facts. Use null when something was not said.

Nikhil's five criteria (each "pass" | "unclear" | "fail", with a short evidence quote from the caller):
c1_real_project: pass = wants design AND execution (full home 2BHK+, partial home of a floor or 2+ rooms,
  a single room with complete redesign and execution, or office/clinic/studio up to ~3,000 sq ft).
  fail = ideas/advice/colours only, will execute themselves, standalone furniture sourcing, Vastu only,
  architecture/structural only, restaurant/hotel/retail/gym, commercial clearly above ~3,000 sq ft.
c2_service_area: pass = Pune city or PCMC (Kothrud, Baner, Aundh, Wakad, Koregaon Park, Kalyani Nagar,
  Viman Nagar, Hadapsar, Magarpatta, NIBM, Kondhwa, Undri, Kharadi, Shivane, Warje, Erandwane, Deccan,
  Pimpri, Chinchwad, Pimple Saudagar, Pimple Nilakh, Ravet, Hinjewadi, Nanded City and adjoining areas).
  fail = Talegaon, Lonavala, Nashik, Mumbai or any other city. unclear = locality not stated or unknown.
c3_timeline: pass = completion date allows ~3-4 weeks design + 8-16 weeks execution. fail = needs
  completion in under 6 weeks from the call date and the caller did not accept a later date.
  unclear = no date given.
c4_budget: pass = budget not mentioned, or volunteered and not clearly below scope. fail = volunteered
  figure clearly below scope (e.g. Rs 1-1.5 lakh for kitchen + bedroom). unclear = borderline figure.
  Internal floors only: single room Rs 3.5 lakh; residential carpet sqft x 1,800; commercial sqft x 1,200.
c5_decision_maker: pass = caller decides or is authorised. unclear = calling for someone else without
  clear authority. Never "fail".

call_type: "new_enquiry" | "existing_client" (complaint or question about an ongoing project) |
  "repeat_enquiry" (chasing an earlier enquiry that was not followed up) | "other" (vendor, job seeker,
  sales, unrelated).
route: "QUALIFIED" (all pass) | "QUALIFIED_FLAGGED" (no fail, but c4 or c5 unclear, or c1-c3 still
  unclear after one question) | "NOT_A_FIT" (any fail) | "ESCALATE" (existing client complaint) |
  "INCOMPLETE" (caller dropped before a route) | "OTHER" (unrelated call).

flags: short strings naming anything the designer must know, e.g. "decision-maker unclear: son calling
  for parents", "budget borderline", "rented property, no structural work", "earlier enquiry not followed
  up; caller frustrated", "asked for principal designer", "asked for Nikhil", "site visit preferred",
  "small commercial space".

handoff_note: plain text for a designer on Telegram, max ~12 short lines, so their first call does not
  repeat questions already asked. Include name, number, project, area, scope, size, site status, timeline,
  decision-maker, booking (or "designer to schedule"), flags, and source if given. No prices. For an
  existing-client complaint write an URGENT escalation note instead (name, project location, designer
  named, what is wrong, what was promised). For NOT_A_FIT/OTHER/INCOMPLETE write one line for the log.

summary: 1-2 sentences for the dashboard.

Return exactly this JSON shape:
{"caller_name":string|null,"call_type":string,"property_type":"residential"|"commercial"|null,
"scope_description":string,"size_bhk":string|null,"size_sqft":number|null,"locality":string|null,
"site_status":string|null,"completion_needed_by":string|null,
"decision_maker":"self"|"authorised_on_behalf"|"unclear","budget_volunteered":string|null,
"source":string|null,"criteria":{"c1_real_project":{"result":string,"evidence":string},
"c2_service_area":{...},"c3_timeline":{...},"c4_budget":{...},"c5_decision_maker":{...}},
"route":string,"flags":string[],"price_asked":boolean,
"booking_type":"site_visit"|"studio"|null,"summary":string,"handoff_note":string}`;

export async function structureCall(transcript: string, known: Partial<CallRecord>): Promise<GeminiResult> {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY not set");

  const knownForPrompt = { ...known } as Record<string, unknown>;
  delete knownForPrompt.transcript;

  const user = `Call date/time: ${known.started_at ?? "unknown"} (studio timezone ${config.timezone})
Known fields from the voice agent (trust these unless the transcript clearly contradicts them):
${JSON.stringify(knownForPrompt, null, 1)}

Transcript:
${transcript || "(empty: the call dropped before anything was said)"}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": config.geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  let out: any;
  try {
    out = JSON.parse(text.replace(/^```(json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }

  const { summary, handoff_note, booking_type, ...fields } = out;
  if (booking_type && !known.booking?.type) {
    (fields as Partial<CallRecord>).booking = { slot: known.booking?.slot ?? null, type: booking_type };
  }

  return {
    fields,
    summary: String(summary ?? ""),
    handoff_note: String(handoff_note ?? ""),
    inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (data?.usageMetadata?.candidatesTokenCount ?? 0) + (data?.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

export const geminiCostInr = (inTok: number, outTok: number) =>
  ((inTok / 1e6) * config.geminiInputUsdPerM + (outTok / 1e6) * config.geminiOutputUsdPerM) * config.usdToInr;
