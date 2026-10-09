// Vaani adapter. Vaani's exact end-of-call payload depends on the account and how
// the agent's "collected data" is configured, so this accepts:
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
  const nestKeys = ["call", "data", "payload", "record", "end_of_call", "extracted_data", "collected_data",
    "analysis", "post_call_analysis", "custom_analysis_data", "variables", "metadata", "result"];
  for (let i = 0; i < out.length && i < 12; i++) {
    for (const k of nestKeys) if (isObj(out[i][k])) out.push(out[i][k]);
  }
  return out;
}

function pick(ls: Obj[], ...keys: string[]): any {
  for (const l of ls) for (const k of keys) {
    const v = l[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function transcriptToText(t: unknown): string {
  if (typeof t === "string") return t.trim();
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

  const startedAt =
    toIso(pick(ls, "started_at", "start_time", "start_timestamp", "startedAt", "call_start", "created_at")) ??
    new Date().toISOString();
  const endedAt = toIso(pick(ls, "ended_at", "end_time", "end_timestamp", "endedAt", "call_end"));

  let duration = numOrNull(pick(ls, "duration_seconds", "duration", "call_duration", "durationSeconds"));
  const durationMs = numOrNull(pick(ls, "duration_ms", "call_duration_ms"));
  if (!duration && durationMs) duration = Math.round(durationMs / 1000);
  if (!duration && endedAt) duration = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));

  const criteria = pick(ls, "criteria");
  const booking = pick(ls, "booking");

  const partial: Partial<CallRecord> = {
    call_id: String(pick(ls, "call_id", "callId", "call_sid", "id", "session_id", "conversation_id") ?? ""),
    started_at: startedAt,
    duration_seconds: duration ?? 0,
    answer_seconds: numOrNull(pick(ls, "answer_seconds", "ring_seconds", "time_to_answer")),
    caller_phone: String(pick(ls, "caller_phone", "from_number", "from", "caller", "customer_number", "phone", "phone_number") ?? ""),
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
    criteria: isObj(criteria) ? (criteria as Criteria) : undefined,
    route: pick(ls, "route") ?? undefined,
    flags: Array.isArray(pick(ls, "flags")) ? pick(ls, "flags") : undefined,
    price_asked: typeof pick(ls, "price_asked") === "boolean" ? pick(ls, "price_asked") : undefined,
    booking_status: pick(ls, "booking_status") ?? undefined,
    booking: isObj(booking) ? { slot: toIso(booking.slot), type: booking.type ?? null } : undefined,
    voice_minutes: numOrNull(pick(ls, "voice_minutes", "billed_minutes", "minutes")) ?? undefined,
  };

  // Drop undefined keys so later merges don't overwrite good values.
  for (const k of Object.keys(partial) as (keyof CallRecord)[]) if (partial[k] === undefined) delete partial[k];

  return { partial, transcript };
}
