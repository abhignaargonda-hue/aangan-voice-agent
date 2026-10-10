-- Aangan Studio voice agent: one row per call. Applied by `npm run db:migrate`.

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  is_test boolean not null default false,
  processing_status text not null default 'received',
  processing_error text,

  -- End-of-call record (voice-agent-rubric.md section 9)
  call_id text,
  started_at timestamptz not null default now(),
  duration_seconds integer default 0,
  after_hours boolean default false,
  answer_seconds numeric,
  caller_phone text,
  caller_name text,
  call_type text,
  property_type text,
  scope_description text,
  size_bhk text,
  size_sqft numeric,
  locality text,
  site_status text,
  completion_needed_by text,
  decision_maker text,
  budget_volunteered text,
  source text,
  criteria jsonb,
  route text,
  agent_route text,
  flags text[] default '{}',
  price_asked boolean default false,
  booking_status text default 'not_applicable',
  booking jsonb,
  transcript text,
  voice_minutes numeric default 0,

  -- Downstream
  summary text,
  handoff_note text,
  linked_call_id uuid,
  alert_sent boolean default false,
  hubspot_contact_id text,
  hubspot_deal_id text,

  -- Cost
  ai_input_tokens integer default 0,
  ai_output_tokens integer default 0,
  ai_cost_inr numeric default 0,
  voice_cost_inr numeric default 0,

  raw_payload jsonb
);

create index if not exists calls_started_at_idx on public.calls (started_at desc);
create index if not exists calls_phone_idx on public.calls (caller_phone, started_at desc);
create unique index if not exists calls_call_id_uidx on public.calls (call_id) where call_id is not null and call_id <> '';

-- Bookings made by the agent during the call (Cal.com), matched to the call afterwards.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  call_id text,
  caller_phone text,
  caller_name text,
  slot timestamptz not null,
  type text,
  calcom_uid text
);

create index if not exists bookings_created_idx on public.bookings (created_at desc);

-- Early call events (call_started / user_picked_up) carry the caller's number,
-- which the end-of-call event may not. Matched to the call by call_id.
create table if not exists public.call_events (
  call_id text primary key,
  created_at timestamptz not null default now(),
  event text,
  caller_phone text,
  raw jsonb
);
