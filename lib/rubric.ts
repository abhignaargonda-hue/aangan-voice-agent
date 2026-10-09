// Deterministic checks from voice-agent-rubric.md. These run on every call after
// Vaani hands over, so a wrong route or a spoken price is caught even if the
// agent or the AI gets it wrong.

import { config } from "./config";
import type { Criteria, Route } from "./types";

// Section 5 routing table. Returns null when the agent should still be asking.
export function computeRoute(criteria: Criteria, callType: string): Route {
  if (callType === "existing_client") return "ESCALATE";
  if (callType === "other") return "OTHER";

  const r = [
    criteria.c1_real_project.result,
    criteria.c2_service_area.result,
    criteria.c3_timeline.result,
    criteria.c4_budget.result,
    criteria.c5_decision_maker.result,
  ];
  if (r.some((x) => x === "fail")) return "NOT_A_FIT";

  const unclear123 = r.slice(0, 3).some((x) => x === "unclear");
  if (unclear123) return config.forwardUnclearAfterOneQuestion ? "QUALIFIED_FLAGGED" : "NOT_A_FIT";

  const unclear45 = r.slice(3).some((x) => x === "unclear");
  return unclear45 ? "QUALIFIED_FLAGGED" : "QUALIFIED";
}

export const isQualified = (route: Route) => route === "QUALIFIED" || route === "QUALIFIED_FLAGGED";

// R1: the agent must never say a price, range, per-sq-ft figure, "starts at", etc.
// Scans agent turns only; the caller may say numbers freely.
const PRICE_PATTERNS: RegExp[] = [
  /₹\s*\d/,
  /\brs\.?\s*\d/i,
  /\binr\s*\d/i,
  /\d[\d,.]*\s*(lakh|lakhs|lac|lacs|crore|crores|k\b|thousand)/i,
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\s+(lakh|lakhs|crore)/i,
  /per\s+(sq|square)\.?\s*(ft|feet|foot)/i,
  /\bstarts?\s+(at|from)\b/i,
  /\b(it('|’)ll|it will|would)\s+cost\s+(around|about|roughly)/i,
  /\bballpark\s+(is|would be)\b/i,
  /\btypically\s+(costs?|runs?|comes to)\b/i,
];

export function agentLines(transcript: string): string[] {
  return transcript
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^(agent|assistant|bot|ai|front desk|aangan)\s*:/i.test(l))
    .map((l) => l.replace(/^[^:]+:\s*/, ""));
}

export function detectPriceLeak(transcript: string): string | null {
  for (const line of agentLines(transcript)) {
    if (PRICE_PATTERNS.some((p) => p.test(line))) return line.slice(0, 200);
  }
  return null;
}

// R3: the agent must never ask about budget.
export function detectBudgetAsked(transcript: string): string | null {
  const re = /\b(what('|’)?s|what is|do you have|have you (got|thought of|decided)|any)\b[^?]{0,40}\bbudget\b[^.]*\?/i;
  for (const line of agentLines(transcript)) if (re.test(line)) return line.slice(0, 200);
  return null;
}

export function isAfterHours(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const t = hour + minute / 60;
  return weekday === "Sat" || weekday === "Sun" || t < config.officeOpenHour || t >= config.officeCloseHour;
}

export const emptyCriteria = (): Criteria => ({
  c1_real_project: { result: "unclear", evidence: "" },
  c2_service_area: { result: "unclear", evidence: "" },
  c3_timeline: { result: "unclear", evidence: "" },
  c4_budget: { result: "pass", evidence: "Budget not mentioned" },
  c5_decision_maker: { result: "unclear", evidence: "" },
});
