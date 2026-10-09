// HubSpot: new qualified live calls only. A contact (found by phone, else created)
// and a deal at "consultation booked". Test and seed calls never reach HubSpot.

import { config } from "./config";
import type { CallRow } from "./types";

const API = "https://api.hubapi.com";

async function hs(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.hubspotToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HubSpot ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

function splitName(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstname: parts[0] ?? "Caller", lastname: parts.slice(1).join(" ") };
}

export async function pushToHubSpot(row: CallRow): Promise<{ contactId: string; dealId: string }> {
  let contactId: string | undefined;
  if (row.caller_phone) {
    const found = await hs("/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: row.caller_phone }] }],
      limit: 1,
    });
    contactId = found?.results?.[0]?.id;
  }
  if (!contactId) {
    const created = await hs("/crm/v3/objects/contacts", {
      properties: { ...splitName(row.caller_name), phone: row.caller_phone, city: row.locality ?? "" },
    });
    contactId = created.id as string;
  }

  const project = [row.size_bhk, row.property_type, row.locality].filter(Boolean).join(" · ");
  const deal = await hs("/crm/v3/objects/deals", {
    properties: {
      dealname: `${row.caller_name ?? "Caller"} — ${project || "Interior project"}`,
      pipeline: config.hubspotPipeline,
      dealstage: config.hubspotDealStage,
      description: [row.summary, row.flags?.length ? `Flags: ${row.flags.join("; ")}` : "", `Call: ${config.appUrl}/calls/${row.id}`]
        .filter(Boolean)
        .join("\n"),
    },
    associations: [
      { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] },
    ],
  });
  return { contactId, dealId: deal.id as string };
}
