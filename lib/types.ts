// Field names follow voice-agent-rubric.md section 9. Keep them stable:
// the dashboard, Telegram and HubSpot all read them.

export type CriterionResult = "pass" | "unclear" | "fail";
export type Route = "QUALIFIED" | "QUALIFIED_FLAGGED" | "NOT_A_FIT" | "ESCALATE" | "INCOMPLETE" | "OTHER";
export type CallType = "new_enquiry" | "existing_client" | "repeat_enquiry" | "other";
export type BookingStatus = "booked" | "designer_to_schedule" | "not_applicable";

export interface Criterion {
  result: CriterionResult;
  evidence: string;
}

export interface Criteria {
  c1_real_project: Criterion;
  c2_service_area: Criterion;
  c3_timeline: Criterion;
  c4_budget: Criterion;
  c5_decision_maker: Criterion;
}

export interface CallRecord {
  call_id: string;
  started_at: string;
  duration_seconds: number;
  after_hours: boolean;
  answer_seconds: number | null;
  caller_phone: string;
  caller_name: string | null;
  call_type: CallType;
  property_type: "residential" | "commercial" | null;
  scope_description: string;
  size_bhk: string | null;
  size_sqft: number | null;
  locality: string | null;
  site_status: string | null;
  completion_needed_by: string | null;
  decision_maker: "self" | "authorised_on_behalf" | "unclear";
  budget_volunteered: string | null;
  source: string | null;
  criteria: Criteria;
  route: Route;
  flags: string[];
  price_asked: boolean;
  booking_status: BookingStatus;
  booking: { slot: string | null; type: "site_visit" | "studio" | null };
  transcript: string;
  voice_minutes: number;
}

// One row per call in the call log (Neon `calls` table).
export interface CallRow extends CallRecord {
  id: string;
  created_at: string;
  is_test: boolean;
  processing_status: "received" | "processed" | "error";
  processing_error: string | null;
  summary: string | null;
  handoff_note: string | null;
  agent_route: Route | null;
  linked_call_id: string | null;
  alert_sent: boolean;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string | null;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_cost_inr: number;
  voice_cost_inr: number;
  raw_payload: unknown;
}
