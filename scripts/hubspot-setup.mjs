// One-time HubSpot setup for the founder's view. Safe to re-run.
// Creates the "Aangan Studio" property groups and fields on contacts and deals, and
// the "Aangan Projects" deal pipeline with win probabilities per stage.
// Usage: npm run hubspot:setup

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
if (!token) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN not set");
const API = "https://api.hubapi.com";

async function hs(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const opts = (pairs) => pairs.map(([value, label], i) => ({ value, label, displayOrder: i }));
const text = (name, label, description) => ({ name, label, description, type: "string", fieldType: "text" });
const area = (name, label, description) => ({ name, label, description, type: "string", fieldType: "textarea" });
const number = (name, label, description) => ({ name, label, description, type: "number", fieldType: "number" });
const datetime = (name, label, description) => ({ name, label, description, type: "datetime", fieldType: "date" });
const select = (name, label, description, pairs) => ({ name, label, description, type: "enumeration", fieldType: "select", options: opts(pairs) });
const yesno = (name, label, description) => ({
  name, label, description, type: "enumeration", fieldType: "booleancheckbox", options: opts([["true", "Yes"], ["false", "No"]]),
});

const DEAL_FIELDS = [
  select("aangan_route", "Call outcome", "Route the phone agent decided", [["QUALIFIED", "Qualified"], ["QUALIFIED_FLAGGED", "Qualified + flag"]]),
  select("aangan_property_type", "Property type", "", [["residential", "Residential"], ["commercial", "Commercial"]]),
  text("aangan_locality", "Locality", "Area in Pune / PCMC"),
  text("aangan_size_bhk", "Size (BHK)", ""),
  number("aangan_size_sqft", "Carpet area (sq ft)", ""),
  area("aangan_scope", "Project scope", "What the caller wants done"),
  text("aangan_complete_by", "Needs completion by", "In the caller's words"),
  select("aangan_size_band", "Project size band", "From the indicative value", [
    ["under_5l", "Under ₹5L"], ["5_10l", "₹5–10L"], ["10_20l", "₹10–20L"], ["20_40l", "₹20–40L"], ["over_40l", "₹40L+"],
  ]),
  text("aangan_estimate_basis", "Value estimate basis", "How the indicative amount was worked out (internal only)"),
  datetime("aangan_consultation_at", "Consultation date", ""),
  select("aangan_consultation_type", "Consultation type", "", [["site_visit", "Site visit"], ["studio", "At the studio"], ["to_schedule", "Designer to schedule"]]),
  yesno("aangan_after_hours", "After-hours call", "Call came outside 10am–7pm or on a weekend"),
  text("aangan_lead_source", "Lead source", "Referral, Instagram, LinkedIn… as the caller said"),
  select("aangan_decision_maker", "Decision-maker", "", [["self", "Caller decides"], ["authorised_on_behalf", "Authorised on behalf"], ["unclear", "Unclear"]]),
  area("aangan_flags", "Flags for designer", ""),
  text("aangan_call_link", "Call transcript link", "Aangan call log"),
  select("aangan_lead_channel", "Lead channel", "How the lead came in: set automatically for the phone agent; choose Front desk (manual) when staff add a deal by hand", [
    ["voice_agent", "Voice agent (phone)"], ["front_desk_manual", "Front desk (manual)"], ["whatsapp", "WhatsApp"], ["web_form", "Website form"], ["walk_in_referral", "Walk-in / direct referral"],
  ]),
];

const CONTACT_FIELDS = [
  text("aangan_locality", "Locality", "Area in Pune / PCMC"),
  text("aangan_lead_source", "Lead source", "Referral, Instagram, LinkedIn… as the caller said"),
  yesno("aangan_after_hours", "First call after hours", ""),
  datetime("aangan_first_call_at", "First call", "When the caller first rang the studio"),
];

const STAGES = [
  ["Consultation booked", "0.1"],
  ["Consultation done", "0.2"],
  ["Design proposal sent", "0.35"],
  ["Design signed / advance paid", "0.8"],
  ["In execution", "0.9"],
  ["Project completed (won)", "1.0", true],
  ["Lost", "0.0", true],
];

async function ensureGroup(object) {
  const r = await hs("POST", `/crm/v3/properties/${object}/groups`, { name: "aangan", label: "Aangan Studio", displayOrder: -1 });
  if (!r.ok && r.status !== 409) throw new Error(`${object} group: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
}

async function ensureFields(object, fields) {
  for (const f of fields) {
    const r = await hs("POST", `/crm/v3/properties/${object}`, { ...f, groupName: "aangan" });
    if (r.ok) console.log(`  + ${object}.${f.name}`);
    else if (r.status === 409) console.log(`  = ${object}.${f.name} (exists)`);
    else throw new Error(`${object}.${f.name}: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  }
}

async function ensurePipeline() {
  const list = await hs("GET", "/crm/v3/pipelines/deals");
  if (!list.ok) throw new Error(`pipelines: ${list.status} ${JSON.stringify(list.json).slice(0, 300)}`);
  let p = list.json.results.find((x) => x.label === "Aangan Projects");
  if (!p) {
    const r = await hs("POST", "/crm/v3/pipelines/deals", {
      label: "Aangan Projects",
      displayOrder: 0,
      stages: STAGES.map(([label, probability, closed], i) => ({
        label,
        displayOrder: i,
        metadata: { probability, ...(closed ? { isClosed: "true" } : {}) },
      })),
    });
    if (!r.ok) throw new Error(`create pipeline: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
    p = r.json;
    console.log("  + pipeline Aangan Projects");
  } else {
    console.log("  = pipeline Aangan Projects (exists), syncing probabilities");
    for (const [label, probability, closed] of STAGES) {
      const st = p.stages.find((x) => x.label === label);
      if (!st) continue;
      const r = await hs("PATCH", `/crm/v3/pipelines/deals/${p.id}/stages/${st.id}`, {
        metadata: { probability, ...(closed ? { isClosed: "true" } : {}) },
      });
      if (!r.ok) throw new Error(`stage ${label}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    }
  }
  const first = [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder)[0];
  return { pipelineId: p.id, stageId: first.id };
}

console.log("Property groups and fields:");
await ensureGroup("deals");
await ensureGroup("contacts");
await ensureFields("deals", DEAL_FIELDS);
await ensureFields("contacts", CONTACT_FIELDS);
console.log("Pipeline:");
const { pipelineId, stageId } = await ensurePipeline();
console.log(`\nHUBSPOT_PIPELINE_ID=${pipelineId}\nHUBSPOT_DEALSTAGE_CONSULTATION_BOOKED=${stageId}`);
