// HubSpot: new qualified live calls only. A contact (found by phone, else created)
// and a deal in the "Aangan Projects" pipeline at "Consultation booked", with the
// Aangan fields and an indicative value for the founder's pipeline view.
// Test and seed calls never reach HubSpot.

import { config } from "./config";
import { estimateProjectValue } from "./estimate";
import type { CallRow } from "./types";

const API = "https://api.hubapi.com";

class HubSpotError extends Error {
  constructor(message: string, public body: any) {
    super(message);
  }
}

async function hs(path: string, body: unknown, method = "POST") {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${config.hubspotToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HubSpotError(`HubSpot ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`, json);
  return json;
}

// If the Aangan fields have not been created yet (npm run hubspot:setup), retry
// with HubSpot's built-in fields only, so a lead is never lost.
async function withFallback<T>(full: Record<string, unknown>, basic: Record<string, unknown>, send: (p: Record<string, unknown>) => Promise<T>) {
  try {
    return await send(full);
  } catch (e) {
    if (e instanceof HubSpotError && /PROPERTY_DOESNT_EXIST|does not exist|INVALID_OPTION/i.test(JSON.stringify(e.body))) return send(basic);
    throw e;
  }
}

function splitName(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstname: parts[0] ?? "Caller", lastname: parts.slice(1).join(" ") };
}

function sizeBand(amount: number) {
  if (amount < 500_000) return "under_5l";
  if (amount < 1_000_000) return "5_10l";
  if (amount < 2_000_000) return "10_20l";
  if (amount < 4_000_000) return "20_40l";
  return "over_40l";
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));

export async function pushToHubSpot(row: CallRow): Promise<{ contactId: string; dealId: string }> {
  const callLink = `${config.appUrl}/calls/${row.id}`;
  const afterHours = row.after_hours ? "true" : "false";

  let contactId: string | undefined;
  if (row.caller_phone) {
    const found = await hs("/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: row.caller_phone }] }],
      limit: 1,
    });
    contactId = found?.results?.[0]?.id;
  }
  if (!contactId) {
    const basic = clean({ ...splitName(row.caller_name), phone: row.caller_phone, city: row.locality, lifecyclestage: "opportunity" });
    const full = clean({
      ...basic,
      aangan_locality: row.locality,
      aangan_lead_source: row.source,
      aangan_after_hours: afterHours,
      aangan_first_call_at: row.started_at,
    });
    const created = await withFallback(full, basic, (properties) => hs("/crm/v3/objects/contacts", { properties }));
    contactId = created.id as string;
  }

  const { amount, basis } = estimateProjectValue(row);
  const slot = row.booking?.slot ? new Date(row.booking.slot) : null;
  // Forecast: a signing decision about a month after the consultation.
  const closeDate = new Date((slot ?? new Date()).getTime() + 30 * 86400_000).toISOString();
  const project = [row.size_bhk, row.property_type, row.locality].filter(Boolean).join(" · ");

  const basicDeal = clean({
    dealname: `${row.caller_name ?? "Caller"} — ${project || "Interior project"}`,
    pipeline: config.hubspotPipeline,
    dealstage: config.hubspotDealStage,
    amount: String(amount),
    closedate: closeDate,
    description: [row.summary, row.flags?.length ? `Flags: ${row.flags.join("; ")}` : "", `Value: ${basis}`, `Call: ${callLink}`]
      .filter(Boolean)
      .join("\n"),
  });
  const fullDeal = clean({
    ...basicDeal,
    aangan_route: row.route,
    aangan_property_type: row.property_type,
    aangan_locality: row.locality,
    aangan_size_bhk: row.size_bhk,
    aangan_size_sqft: row.size_sqft ? String(row.size_sqft) : null,
    aangan_scope: row.scope_description,
    aangan_complete_by: row.completion_needed_by,
    aangan_size_band: sizeBand(amount),
    aangan_estimate_basis: basis,
    aangan_consultation_at: slot?.toISOString(),
    aangan_consultation_type: row.booking?.type ?? (row.booking_status === "designer_to_schedule" ? "to_schedule" : null),
    aangan_after_hours: afterHours,
    aangan_lead_source: row.source,
    aangan_decision_maker: row.decision_maker,
    aangan_flags: row.flags?.join("\n"),
    aangan_call_link: callLink,
  });

  const associations = [
    { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] },
  ];
  const deal = await withFallback(fullDeal, basicDeal, (properties) => hs("/crm/v3/objects/deals", { properties, associations }));
  return { contactId, dealId: deal.id as string };
}
