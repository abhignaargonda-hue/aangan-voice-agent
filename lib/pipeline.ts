// End-of-call pipeline (components map, "call ends" onwards):
// Vaani record → Gemini structures it → rubric re-check → Supabase row →
// Telegram handoff / escalation → HubSpot for new qualified live calls.
// Each downstream step is independent: one failing never loses the call.

import { config, integrations } from "./config";
import { geminiCostInr, structureCall } from "./gemini";
import { pushToHubSpot } from "./hubspot";
import { normalizeVaaniPayload } from "./normalize";
import { computeRoute, detectBudgetAsked, detectPriceLeak, emptyCriteria, isAfterHours, isQualified } from "./rubric";
import { findBooking, getCall, getCallByCallId, insertCall, recentCallsByPhone, updateCall } from "./store";
import { sendEscalation, sendHandoff } from "./telegram";
import type { CallRecord, CallRow, Criteria, Route } from "./types";

const ROUTES: Route[] = ["QUALIFIED", "QUALIFIED_FLAGGED", "NOT_A_FIT", "ESCALATE", "INCOMPLETE", "OTHER"];
const validRoute = (r: unknown): Route | null => (ROUTES.includes(r as Route) ? (r as Route) : null);

// Step 1, fast: store the raw call so nothing is lost even if later steps fail.
export async function receiveCall(payload: unknown, opts: { isTest?: boolean } = {}) {
  const { partial, transcript } = normalizeVaaniPayload(payload);

  const existing = await getCallByCallId(partial.call_id ?? "");
  if (existing) return { row: existing, duplicate: true };

  const startedAt = partial.started_at ?? new Date().toISOString();
  const duration = partial.duration_seconds ?? 0;
  const row = await insertCall({
    ...emptyRecord(),
    ...partial,
    call_id: partial.call_id || `local-${crypto.randomUUID()}`,
    started_at: startedAt,
    after_hours: isAfterHours(startedAt),
    transcript,
    voice_minutes: partial.voice_minutes ?? Math.ceil(duration / 60),
    agent_route: validRoute(partial.route),
    is_test: !!opts.isTest,
    processing_status: "received",
    raw_payload: payload,
  });
  return { row, duplicate: false };
}

// Step 2, slow: structure, check, store, notify.
export async function processCall(id: string): Promise<CallRow> {
  const row = await getCall(id);
  if (!row) throw new Error(`call ${id} not found`);
  const errors: string[] = [];

  // Known fields from Vaani, minus empties.
  const known: Partial<CallRecord> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) (known as any)[k] = v;
  }

  // Booking made during the call through our Cal.com tool.
  const booking = await findBooking(row.call_id, row.caller_phone).catch(() => null);
  if (booking) {
    known.booking = { slot: booking.slot, type: booking.type };
    known.booking_status = "booked";
  }

  // Gemini structuring.
  let ai: Awaited<ReturnType<typeof structureCall>> | null = null;
  if (integrations().gemini && row.transcript) {
    try {
      ai = await structureCall(row.transcript, slim(known));
    } catch (e: any) {
      errors.push(`gemini: ${e.message}`);
    }
  }

  // Vaani's own fields win over Gemini's (it was on the call); Gemini fills gaps.
  const merged: CallRecord = { ...emptyRecord(), ...(ai?.fields ?? {}), ...stripRowOnly(known) } as CallRecord;
  merged.criteria = mergeCriteria(row.criteria, ai?.fields.criteria);
  merged.flags = Array.from(new Set([...(row.flags ?? []), ...((ai?.fields.flags as string[]) ?? [])]));

  // Route: the agent decided on the call; check it against the rubric table.
  const transcriptEmpty = !row.transcript || row.transcript.length < 40;
  const agentRoute = validRoute(row.agent_route) ?? validRoute(ai?.fields.route);
  const ruleRoute = transcriptEmpty ? "INCOMPLETE" : computeRoute(merged.criteria, merged.call_type);
  merged.route = agentRoute ?? ruleRoute;
  if (agentRoute && agentRoute !== ruleRoute && !["INCOMPLETE", "OTHER", "ESCALATE"].includes(agentRoute)) {
    merged.flags.push(`route check: rubric says ${ruleRoute}, agent said ${agentRoute}`);
  }
  if (merged.call_type === "existing_client" && merged.route !== "ESCALATE") {
    merged.flags.push("existing client not escalated by agent — escalated by system");
    merged.route = "ESCALATE";
  }

  // Hard-rule monitors (R1, R3).
  const leak = detectPriceLeak(row.transcript);
  if (leak) merged.flags.push(`PRICE RULE: agent may have said a figure: "${leak}"`);
  const budgetAsk = detectBudgetAsked(row.transcript);
  if (budgetAsk) merged.flags.push(`BUDGET RULE: agent may have asked budget: "${budgetAsk}"`);
  if (!ai) merged.price_asked = merged.price_asked || /\b(price|pricing|cost|rate|charge|ballpark|how much)\b/i.test(row.transcript);

  // Booking status follows the route.
  if (!isQualified(merged.route)) merged.booking_status = "not_applicable";
  else if (merged.booking?.slot) merged.booking_status = "booked";
  else merged.booking_status = "designer_to_schedule";

  // Dropped call then ring-back (T17): link to the earlier call from the same number.
  let linked: string | null = null;
  const earlier = await recentCallsByPhone(row.caller_phone, row.started_at, 24).catch(() => []);
  if (earlier.length) {
    linked = earlier[0].id;
    if (earlier.some((c) => c.route === "INCOMPLETE")) merged.flags.push("rang back after a dropped call");
  }

  const voiceCost = merged.voice_minutes * config.vaaniCostPerMinInr;
  const aiCost = ai ? geminiCostInr(ai.inputTokens, ai.outputTokens) : 0;

  const patch: Partial<CallRow> = {
    ...merged,
    flags: Array.from(new Set(merged.flags)),
    summary: ai?.summary || fallbackSummary(merged),
    handoff_note: ai?.handoff_note || fallbackNote(merged),
    linked_call_id: linked,
    ai_input_tokens: ai?.inputTokens ?? 0,
    ai_output_tokens: ai?.outputTokens ?? 0,
    ai_cost_inr: round(aiCost, 4),
    voice_cost_inr: round(voiceCost, 2),
  };
  await updateCall(id, patch);
  let updated = { ...row, ...patch } as CallRow;

  // Telegram.
  try {
    if (isQualified(updated.route) && integrations().telegram) {
      await sendHandoff(updated);
      updated.alert_sent = true;
    } else if (updated.route === "ESCALATE" && integrations().telegramEscalation) {
      await sendEscalation(updated);
      updated.alert_sent = true;
    }
  } catch (e: any) {
    errors.push(`telegram: ${e.message}`);
  }

  // HubSpot: new qualified live calls only, never tests or seed data.
  try {
    if (isQualified(updated.route) && !updated.is_test && integrations().hubspot) {
      const { contactId, dealId } = await pushToHubSpot(updated);
      updated.hubspot_contact_id = contactId;
      updated.hubspot_deal_id = dealId;
    }
  } catch (e: any) {
    errors.push(`hubspot: ${e.message}`);
  }

  const final: Partial<CallRow> = {
    alert_sent: updated.alert_sent ?? false,
    hubspot_contact_id: updated.hubspot_contact_id ?? null,
    hubspot_deal_id: updated.hubspot_deal_id ?? null,
    processing_status: errors.length && !ai ? "error" : "processed",
    processing_error: errors.length ? errors.join(" | ") : null,
  };
  await updateCall(id, final);
  return { ...updated, ...final };
}

function emptyRecord(): CallRecord {
  return {
    call_id: "",
    started_at: new Date().toISOString(),
    duration_seconds: 0,
    after_hours: false,
    answer_seconds: null,
    caller_phone: "",
    caller_name: null,
    call_type: "new_enquiry",
    property_type: null,
    scope_description: "",
    size_bhk: null,
    size_sqft: null,
    locality: null,
    site_status: null,
    completion_needed_by: null,
    decision_maker: "unclear",
    budget_volunteered: null,
    source: null,
    criteria: emptyCriteria(),
    route: "INCOMPLETE",
    flags: [],
    price_asked: false,
    booking_status: "not_applicable",
    booking: { slot: null, type: null },
    transcript: "",
    voice_minutes: 0,
  };
}

const ROW_ONLY = ["id", "created_at", "is_test", "processing_status", "processing_error", "summary", "handoff_note",
  "agent_route", "linked_call_id", "alert_sent", "hubspot_contact_id", "hubspot_deal_id", "ai_input_tokens",
  "ai_output_tokens", "ai_cost_inr", "voice_cost_inr", "raw_payload", "criteria", "flags", "route"];

function stripRowOnly(o: Partial<CallRecord>) {
  const out: any = { ...o };
  for (const k of ROW_ONLY) delete out[k];
  // Defaults written at insert time are not real agent answers.
  if (out.call_type === "new_enquiry") delete out.call_type;
  if (out.decision_maker === "unclear") delete out.decision_maker;
  if (out.booking_status === "not_applicable") delete out.booking_status;
  if (!out.booking?.slot && !out.booking?.type) delete out.booking;
  if (out.price_asked === false) delete out.price_asked;
  return out;
}

function slim(o: Partial<CallRecord>) {
  const out: any = stripRowOnly(o);
  delete out.transcript;
  return out;
}

function mergeCriteria(fromAgent: Criteria | null | undefined, fromAi: Criteria | undefined): Criteria {
  const base = emptyCriteria();
  const keys = Object.keys(base) as (keyof Criteria)[];
  const agentIsDefault = !fromAgent || keys.every((k) => !fromAgent[k]?.evidence);
  for (const k of keys) {
    const a = agentIsDefault ? undefined : fromAgent?.[k];
    const g = fromAi?.[k];
    const pickOne = a?.result ? a : g?.result ? g : base[k];
    base[k] = { result: (["pass", "unclear", "fail"].includes(pickOne.result) ? pickOne.result : "unclear") as any, evidence: pickOne.evidence ?? "" };
  }
  return base;
}

function fallbackSummary(r: CallRecord) {
  return [r.caller_name, r.size_bhk, r.property_type, r.locality, r.scope_description].filter(Boolean).join(" · ") || "Call received (not yet structured).";
}

function fallbackNote(r: CallRecord) {
  return [
    `Name: ${r.caller_name ?? "—"}`,
    `Number: ${r.caller_phone || "—"}`,
    `Project: ${[r.size_bhk, r.property_type, r.size_sqft ? `${r.size_sqft} sq ft` : ""].filter(Boolean).join(", ") || "—"}`,
    `Area: ${r.locality ?? "—"}`,
    `Scope: ${r.scope_description || "—"}`,
    `Timeline: ${r.completion_needed_by ?? "—"}`,
    `Booking: ${r.booking?.slot ?? "designer to schedule"}`,
    r.flags.length ? `Flags: ${r.flags.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
