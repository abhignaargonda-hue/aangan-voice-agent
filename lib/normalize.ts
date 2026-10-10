// Vaani adapter. Vaani (app.vaanivoice.ai) sends a `call_postprocessing` webhook:
//   { event, call_id, timestamp, data: { call_id, call_duration (ms), end_reason, summary,
//     entities: {...extraction data points...}, dispositions, recording_url,
//     transcript: "AGENT: ...\nUSER: ..." } }
// Entity names match the rubric section 9 fields (see /setup). This also accepts:
//   1. The rubric section 9 record directly (preferred: configure Vaani to emit it), or
//   2. A generic voice-platform payload (call id, phone, timestamps, transcript as
//      text or as an array of turns, plus any extracted fields nested under
//      data / extracted_data / collected_data / analysis / variables).
// Anything missing is filled in later by Gemini from the transcript.

import type { CallRecord, Criteria } from "./types";

type Obj = Record<string, any>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

// Flatten the likely nesting levels into one lookup, outermost wins.
function layers(payload: Obj): Obj[] {
  const out: Obj[] = [payload];
  const nestKeys = ["call", "data", "entities", "entity", "dispositions", "payload", "record", "end_of_call", "extracted_data", "collected_data",
    "analysis", "post_call_analysis", "custom_analysis_data", "variables", "metadata", "result"];
  for (let i = 0; i < out.length && i < 12; i++) {
    for (const k of nestKeys) if (isObj(out[i][k])) out.push(out[i][k]);
  }
  return out;
}

// Vaani entities arrive as strings; "null", "N/A", "unknown" mean not said.
function clean(v: unknown): any {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || /^(null|none|n\/a|na|unknown|not mentioned|not provided|-)$/i.test(t)) return undefined;
    return t;
  }
  return v;
}

const toBool = (v: unknown) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(yes|true|y|1)$/i.test(v.trim());
  return undefined;
};

// Keys are matched loosely: "Caller Phone", "caller_phone" and "CallerPhone" are the same.
const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(ls: Obj[], ...keys: string[]): any {
  for (const l of ls) {
    const byKey = new Map(Object.entries(l).map(([k, v]) => [keyOf(k), v]));
    for (const k of keys) {
      const v = clean(byKey.get(keyOf(k)));
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function transcriptToText(t: unknown): string {
  if (typeof t === "string") {
    // Vaani: optional timestamps, then AGENT: / USER: labels.
    return t
      .split(/\n+/)
      .map((l) => l.trim().replace(/^\[?\(?\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\]?\)?\s*[-–]?\s*/, ""))
      .map((l) => l.replace(/^USER\s*:/i, "Caller:").replace(/^AGENT\s*:/i, "Agent:"))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(t)) {
    return t
      .map((turn: any) => {
        if (typeof turn === "string") return turn;
        const role = String(turn.role ?? turn.speaker ?? turn.from ?? "").toLowerCase();
        const text = turn.content ?? turn.text ?? turn.message ?? turn.transcript ?? "";
        const who = /agent|assistant|bot|ai|system/.test(role) ? "Agent" : "Caller";
        return text ? `${who}: ${String(text).trim()}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function toIso(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v));
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const numOrNull = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface NormalizedInput {
  partial: Partial<CallRecord>;
  transcript: string;
}

export function normalizeVaaniPayload(payload: unknown): NormalizedInput {
  const ls = layers(isObj(payload) ? payload : {});

  const transcript = transcriptToText(
    pick(ls, "transcript", "transcript_text", "transcription", "conversation", "messages", "transcript_object"),
  );

  const isVaaniPost = String(pick(ls, "event") ?? "") === "call_postprocessing";
  const vaaniMs = isVaaniPost ? numOrNull(pick(ls, "call_duration")) : null;

  let endedAt = toIso(pick(ls, "ended_at", "end_time", "end_timestamp", "endedAt", "call_end"));
  if (!endedAt && isVaaniPost) endedAt = toIso(pick(ls, "timestamp"));
  const startedAt =
    toIso(pick(ls, "started_at", "start_time", "start_timestamp", "startedAt", "call_start", "created_at")) ??
    (endedAt && vaaniMs ? new Date(Date.parse(endedAt) - vaaniMs).toISOString() : null) ??
    endedAt ??
    new Date().toISOString();

  let duration = vaaniMs ? Math.round(vaaniMs / 1000) : numOrNull(pick(ls, "duration_seconds", "duration", "call_duration", "durationSeconds"));
  const durationMs = numOrNull(pick(ls, "duration_ms", "call_duration_ms"));
  if (!duration && durationMs) duration = Math.round(durationMs / 1000);
  if (!duration && endedAt) duration = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));

  const criteria = pick(ls, "criteria");
  let booking = pick(ls, "booking");
  if (typeof booking === "string") { try { booking = JSON.parse(booking); } catch { booking = undefined; } }
  const flatSlot = pick(ls, "booking_slot");
  const flatType = pick(ls, "booking_type", "consultation_type");
  if (!isObj(booking) && (flatSlot || flatType)) booking = { slot: flatSlot ?? null, type: flatType ?? null };
  let criteriaVal = criteria;
  if (typeof criteriaVal === "string") { try { criteriaVal = JSON.parse(criteriaVal); } catch { criteriaVal = undefined; } }
  let flags = pick(ls, "flags");
  if (typeof flags === "string") flags = flags.split(/[;\n]|,(?![^(]*\))/).map((f: string) => f.trim()).filter(Boolean);

  const partial: Partial<CallRecord> = {
    call_id: String(pick(ls, "call_id", "callId", "room_name", "call_sid", "id", "session_id", "conversation_id") ?? ""),
    started_at: startedAt,
    duration_seconds: duration ?? 0,
    answer_seconds: numOrNull(pick(ls, "answer_seconds", "ring_seconds", "time_to_answer")),
    caller_phone: String(pick(ls, "caller_phone", "from_number", "from", "caller", "customer_number", "phone", "phone_number", "caller_number") ?? "").replace(/[^\d+]/g, ""),
    caller_name: pick(ls, "caller_name", "name", "customer_name") ?? undefined,
    call_type: pick(ls, "call_type") ?? undefined,
    property_type: pick(ls, "property_type") ?? undefined,
    scope_description: pick(ls, "scope_description", "scope") ?? undefined,
    size_bhk: pick(ls, "size_bhk", "bhk") ?? undefined,
    size_sqft: numOrNull(pick(ls, "size_sqft", "carpet_area", "sqft")) ?? undefined,
    locality: pick(ls, "locality", "location", "area") ?? undefined,
    site_status: pick(ls, "site_status") ?? undefined,
    completion_needed_by: pick(ls, "completion_needed_by", "timeline") ?? undefined,
    decision_maker: pick(ls, "decision_maker") ?? undefined,
    budget_volunteered: pick(ls, "budget_volunteered", "budget") ?? undefined,
    source: pick(ls, "source", "lead_source") ?? undefined,
    criteria: isObj(criteriaVal) ? (criteriaVal as Criteria) : undefined,
    route: (typeof pick(ls, "route") === "string" ? String(pick(ls, "route")).toUpperCase().replace(/[\s-]+/g, "_") : undefined) as any,
    flags: Array.isArray(flags) ? flags : undefined,
    price_asked: toBool(pick(ls, "price_asked")),
    booking_status: pick(ls, "booking_status") ?? undefined,
    booking: isObj(booking) ? { slot: toIso(booking.slot), type: booking.type ?? null } : undefined,
    voice_minutes: numOrNull(pick(ls, "voice_minutes", "billed_minutes", "minutes")) ?? undefined,
  };

  // Drop undefined keys so later merges don't overwrite good values.
  for (const k of Object.keys(partial) as (keyof CallRecord)[]) if (partial[k] === undefined) delete partial[k];

  return { partial, transcript };
}
