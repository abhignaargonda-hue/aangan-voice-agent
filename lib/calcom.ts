// Cal.com API v2, called by the voice agent's tools during the call.

import { config } from "./config";

const API = "https://api.cal.com/v2";

export async function getSlots(fromIso: string, days: number): Promise<string[]> {
  const start = new Date(fromIso);
  const end = new Date(start.getTime() + days * 86400_000);
  const qs = new URLSearchParams({
    eventTypeId: config.calcomEventTypeId,
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: config.timezone,
  });
  const res = await fetch(`${API}/slots?${qs}`, {
    headers: { authorization: `Bearer ${config.calcomApiKey}`, "cal-api-version": "2024-09-04" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cal.com slots ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  const byDay = (json?.data ?? {}) as Record<string, { start: string }[]>;
  return Object.values(byDay).flat().map((s) => s.start).sort();
}

export async function createBooking(args: {
  start: string;
  name: string;
  phone: string;
  type: "site_visit" | "studio" | null;
  notes: string;
  callId: string;
}): Promise<{ uid: string; start: string }> {
  const res = await fetch(`${API}/bookings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.calcomApiKey}`,
      "cal-api-version": "2024-08-13",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      start: new Date(args.start).toISOString(),
      eventTypeId: Number(config.calcomEventTypeId),
      attendee: {
        name: args.name || "Caller",
        // Callers are not asked for email on the phone. The booking goes to the
        // studio's own address; the caller's phone is on the booking.
        email: config.calcomAttendeeEmail,
        timeZone: config.timezone,
        phoneNumber: args.phone || undefined,
        language: "en",
      },
      metadata: { call_id: args.callId.slice(0, 40), type: args.type ?? "unspecified", phone: args.phone.slice(0, 40) },
      bookingFieldsResponses: { notes: args.notes.slice(0, 500) },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cal.com booking ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return { uid: json?.data?.uid ?? "", start: json?.data?.start ?? args.start };
}

export function speakSlot(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: config.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
