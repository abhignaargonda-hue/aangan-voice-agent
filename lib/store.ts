// Call log storage. Neon Postgres in production; a local JSON file when
// DATABASE_URL is not set, so the dashboard can be tried locally without a database.

import { neon } from "@neondatabase/serverless";
import { promises as fs } from "fs";
import path from "path";
import { config, integrations } from "./config";
import type { CallRow } from "./types";

export interface BookingRow {
  id: string;
  created_at: string;
  call_id: string | null;
  caller_phone: string | null;
  caller_name: string | null;
  slot: string;
  type: "site_visit" | "studio" | null;
  calcom_uid: string | null;
}

const CALL_COLUMNS = [
  "id", "created_at", "is_test", "processing_status", "processing_error", "call_id", "started_at",
  "duration_seconds", "after_hours", "answer_seconds", "caller_phone", "caller_name", "call_type",
  "property_type", "scope_description", "size_bhk", "size_sqft", "locality", "site_status",
  "completion_needed_by", "decision_maker", "budget_volunteered", "source", "criteria", "route",
  "agent_route", "flags", "price_asked", "booking_status", "booking", "transcript", "voice_minutes",
  "summary", "handoff_note", "linked_call_id", "alert_sent", "hubspot_contact_id", "hubspot_deal_id",
  "ai_input_tokens", "ai_output_tokens", "ai_cost_inr", "voice_cost_inr", "raw_payload",
];
const JSON_COLUMNS = new Set(["criteria", "booking", "raw_payload"]);
const NUMERIC_COLUMNS = ["answer_seconds", "size_sqft", "voice_minutes", "ai_cost_inr", "voice_cost_inr"];

let client: ReturnType<typeof neon> | null = null;
const db = () => {
  if (!client) client = neon(config.databaseUrl);
  return client;
};
const useDb = () => integrations().database;

async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(text, params)) as T[];
}

// Postgres → plain JSON: timestamps as ISO strings, numerics as numbers.
function fromDb<T>(r: any): T {
  const out: any = { ...r };
  for (const [k, v] of Object.entries(out)) if (v instanceof Date) out[k] = v.toISOString();
  for (const k of NUMERIC_COLUMNS) if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
  return out as T;
}

function toDb(row: Partial<CallRow>): [string[], unknown[]] {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (!CALL_COLUMNS.includes(k) || v === undefined) continue;
    cols.push(k);
    vals.push(JSON_COLUMNS.has(k) && v !== null ? JSON.stringify(v) : v);
  }
  return [cols, vals];
}

const DATA_DIR = path.join(process.cwd(), ".data");
async function readFile<T>(name: string): Promise<T[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return [];
  }
}
async function writeFile<T>(name: string, rows: T[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(rows, null, 1));
}

export const storageMode = () => (useDb() ? "neon" : "local-file");

export async function insertCall(row: Partial<CallRow>): Promise<CallRow> {
  const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as CallRow;
  if (useDb()) {
    const [cols, vals] = toDb(full);
    const rows = await q(
      `insert into calls (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
      vals,
    );
    return fromDb<CallRow>(rows[0]);
  }
  const rows = await readFile<CallRow>("calls.json");
  rows.push(full);
  await writeFile("calls.json", rows);
  return full;
}

export async function updateCall(id: string, patch: Partial<CallRow>): Promise<void> {
  if (useDb()) {
    const { id: _ignored, ...rest } = patch;
    const [cols, vals] = toDb(rest);
    if (!cols.length) return;
    await q(`update calls set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")} where id = $${cols.length + 1}`, [...vals, id]);
    return;
  }
  const rows = await readFile<CallRow>("calls.json");
  const i = rows.findIndex((r) => r.id === id);
  if (i >= 0) rows[i] = { ...rows[i], ...patch };
  await writeFile("calls.json", rows);
}

export async function getCall(id: string): Promise<CallRow | null> {
  if (useDb()) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await q(`select * from calls where id = $1`, [id]);
    return rows[0] ? fromDb<CallRow>(rows[0]) : null;
  }
  return (await readFile<CallRow>("calls.json")).find((r) => r.id === id) ?? null;
}

export async function getCallByCallId(callId: string): Promise<CallRow | null> {
  if (!callId) return null;
  if (useDb()) {
    const rows = await q(`select * from calls where call_id = $1 limit 1`, [callId]);
    return rows[0] ? fromDb<CallRow>(rows[0]) : null;
  }
  return (await readFile<CallRow>("calls.json")).find((r) => r.call_id === callId) ?? null;
}

export async function listCalls(sinceIso?: string): Promise<CallRow[]> {
  if (useDb()) {
    const rows = sinceIso
      ? await q(`select * from calls where started_at >= $1 order by started_at desc limit 2000`, [sinceIso])
      : await q(`select * from calls order by started_at desc limit 2000`);
    return rows.map((r) => fromDb<CallRow>(r));
  }
  const rows = await readFile<CallRow>("calls.json");
  return rows
    .filter((r) => !sinceIso || r.started_at >= sinceIso)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

// Calls from the same number in the last `hours`, for linking dropped calls (T17)
// and repeat callers (T16).
export async function recentCallsByPhone(phone: string, beforeIso: string, hours: number): Promise<CallRow[]> {
  if (!phone) return [];
  const since = new Date(Date.parse(beforeIso) - hours * 3600_000).toISOString();
  if (useDb()) {
    const rows = await q(
      `select * from calls where caller_phone = $1 and started_at >= $2 and started_at < $3 order by started_at desc`,
      [phone, since, beforeIso],
    );
    return rows.map((r) => fromDb<CallRow>(r));
  }
  return (await readFile<CallRow>("calls.json")).filter(
    (r) => r.caller_phone === phone && r.started_at >= since && r.started_at < beforeIso,
  );
}

export async function insertBooking(b: Omit<BookingRow, "id" | "created_at">): Promise<BookingRow> {
  const full: BookingRow = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...b };
  if (useDb()) {
    await q(
      `insert into bookings (id, created_at, call_id, caller_phone, caller_name, slot, type, calcom_uid)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [full.id, full.created_at, full.call_id, full.caller_phone, full.caller_name, full.slot, full.type, full.calcom_uid],
    );
    return full;
  }
  const rows = await readFile<BookingRow>("bookings.json");
  rows.push(full);
  await writeFile("bookings.json", rows);
  return full;
}

// The booking made during the call, matched by call id, else by phone in the last 3 hours.
export async function findBooking(callId: string, phone: string): Promise<BookingRow | null> {
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  let rows: BookingRow[];
  if (useDb()) {
    rows = (await q(`select * from bookings where created_at >= $1 order by created_at desc`, [since])).map((r) => fromDb<BookingRow>(r));
  } else {
    rows = (await readFile<BookingRow>("bookings.json")).filter((r) => r.created_at >= since).reverse();
  }
  return (callId && rows.find((r) => r.call_id === callId)) || (phone && rows.find((r) => r.caller_phone === phone)) || null;
}
