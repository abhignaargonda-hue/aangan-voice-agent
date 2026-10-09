// Call log storage. Supabase in production; a local JSON file when Supabase is
// not configured, so the dashboard can be tried locally before keys arrive.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

let client: SupabaseClient | null = null;
const sb = () => {
  if (!client) client = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });
  return client;
};
const useSupabase = () => integrations().supabase;

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

export const storageMode = () => (useSupabase() ? "supabase" : "local-file");

export async function insertCall(row: Partial<CallRow>): Promise<CallRow> {
  const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as CallRow;
  if (useSupabase()) {
    const { data, error } = await sb().from("calls").insert(full).select().single();
    if (error) throw new Error(`Supabase insert: ${error.message}`);
    return data as CallRow;
  }
  const rows = await readFile<CallRow>("calls.json");
  rows.push(full);
  await writeFile("calls.json", rows);
  return full;
}

export async function updateCall(id: string, patch: Partial<CallRow>): Promise<void> {
  if (useSupabase()) {
    const { error } = await sb().from("calls").update(patch).eq("id", id);
    if (error) throw new Error(`Supabase update: ${error.message}`);
    return;
  }
  const rows = await readFile<CallRow>("calls.json");
  const i = rows.findIndex((r) => r.id === id);
  if (i >= 0) rows[i] = { ...rows[i], ...patch };
  await writeFile("calls.json", rows);
}

export async function getCall(id: string): Promise<CallRow | null> {
  if (useSupabase()) {
    const { data } = await sb().from("calls").select("*").eq("id", id).maybeSingle();
    return (data as CallRow) ?? null;
  }
  return (await readFile<CallRow>("calls.json")).find((r) => r.id === id) ?? null;
}

export async function listCalls(sinceIso?: string): Promise<CallRow[]> {
  if (useSupabase()) {
    let q = sb().from("calls").select("*").order("started_at", { ascending: false }).limit(2000);
    if (sinceIso) q = q.gte("started_at", sinceIso);
    const { data, error } = await q;
    if (error) throw new Error(`Supabase list: ${error.message}`);
    return (data as CallRow[]) ?? [];
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
  if (useSupabase()) {
    const { data } = await sb()
      .from("calls")
      .select("*")
      .eq("caller_phone", phone)
      .gte("started_at", since)
      .lt("started_at", beforeIso)
      .order("started_at", { ascending: false });
    return (data as CallRow[]) ?? [];
  }
  return (await readFile<CallRow>("calls.json")).filter(
    (r) => r.caller_phone === phone && r.started_at >= since && r.started_at < beforeIso,
  );
}

export async function insertBooking(b: Omit<BookingRow, "id" | "created_at">): Promise<BookingRow> {
  const full: BookingRow = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...b };
  if (useSupabase()) {
    const { error } = await sb().from("bookings").insert(full);
    if (error) throw new Error(`Supabase booking insert: ${error.message}`);
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
  if (useSupabase()) {
    const { data } = await sb().from("bookings").select("*").gte("created_at", since).order("created_at", { ascending: false });
    rows = (data as BookingRow[]) ?? [];
  } else {
    rows = (await readFile<BookingRow>("bookings.json")).filter((r) => r.created_at >= since).reverse();
  }
  return (callId && rows.find((r) => r.call_id === callId)) || (phone && rows.find((r) => r.caller_phone === phone)) || null;
}

// Vaani may retry a webhook; the same call_id is only processed once.
export async function getCallByCallId(callId: string): Promise<CallRow | null> {
  if (!callId) return null;
  if (useSupabase()) {
    const { data } = await sb().from("calls").select("*").eq("call_id", callId).maybeSingle();
    return (data as CallRow) ?? null;
  }
  return (await readFile<CallRow>("calls.json")).find((r) => r.call_id === callId) ?? null;
}
