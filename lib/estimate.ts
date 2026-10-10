// Indicative project value for the founder's pipeline in HubSpot. INTERNAL ONLY:
// never spoken to a caller and never shown to designers as a quote (pricing.md, R1).
// Uses the standard-specification midpoints from pricing.md; the designer sets the
// real number at the consultation.

import type { CallRecord } from "./types";

const RESIDENTIAL_PER_SQFT = 2100; // standard spec ₹1,800–2,400
const COMMERCIAL_PER_SQFT = 1800; // basic–mid fitout ₹1,200–2,800
const SINGLE_ROOM = 500_000; // ₹3.5–8 lakh all-in
const AVERAGE_PROJECT = 1_100_000; // case brief: average ₹8–14 lakh
const SQFT_BY_BHK: Record<number, number> = { 1: 550, 2: 900, 3: 1250, 4: 2000, 5: 2800 };

export function estimateProjectValue(r: Partial<CallRecord>): { amount: number; basis: string } {
  const scope = (r.scope_description ?? "").toLowerCase();
  const singleRoom = /\b(one|single|a|the|my)\s+(bed)?room\b|\bliving room only\b|\bjust the (living|bed)room\b/.test(scope)
    && !/\b(full|whole|entire|all|complete) (home|flat|house|apartment)\b/.test(scope);

  if (singleRoom) return { amount: SINGLE_ROOM, basis: "Single room, indicative all-in" };

  const sqft = r.size_sqft ? Number(r.size_sqft) : null;
  const bhk = Number(String(r.size_bhk ?? "").match(/(\d)\s*bhk/i)?.[1] ?? NaN);
  const area = sqft || SQFT_BY_BHK[bhk] || null;
  const commercial = r.property_type === "commercial";

  if (area) {
    const rate = commercial ? COMMERCIAL_PER_SQFT : RESIDENTIAL_PER_SQFT;
    return {
      amount: Math.round((area * rate) / 10_000) * 10_000,
      basis: `${sqft ? `${area} sq ft` : `~${area} sq ft (${bhk}BHK typical)`} × ₹${rate.toLocaleString("en-IN")} ${commercial ? "commercial" : "residential"} standard, indicative`,
    };
  }
  return { amount: AVERAGE_PROJECT, basis: "Size not given: studio average project, indicative" };
}
