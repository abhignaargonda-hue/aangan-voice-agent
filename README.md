# Aangan Studio — voice agent backend + dashboard

Every incoming call answered by a Vaani voice agent, qualified against Nikhil's five criteria,
and handed to a designer with everything already asked. Built from `voice-agent-rubric.md`.

```
Caller ─► Vaani agent ──(tools)──► /api/tools/slots, /api/tools/book ─► Cal.com
                │
                └─(call ends)─► /api/vaani/webhook
                                   │ store raw row (Supabase), reply 200 at once
                                   ▼ background
                                Gemini Flash: clean fields, summary, handoff note
                                Rubric re-check: route table, price rule (R1), budget rule (R3)
                                   ├─► Telegram: handoff (qualified) / urgent alert (escalate)
                                   ├─► HubSpot: contact + deal, new qualified live calls only
                                   └─► Dashboard (Vercel): call log + Nikhil's numbers + cost
```

## Pages
- `/` — Nikhil's numbers (answered in 5 min, after-hours, qualified %, bookings, cost per call) and the call log.
- `/calls/:id` — designer view: handoff note, five criteria with evidence, details, transcript, cost.
- `/simulate` — run September's transcripts through the pipeline (test calls, never sent to HubSpot).
- `/setup` — connection status, webhook URL, tool definitions and the agent prompt to paste into Vaani.

## Run locally
```
cp .env.example .env.local   # fill what you have; everything is optional locally
npm install
npm run dev
```
Without Supabase the call log is written to `.data/` (local only). Without Gemini, calls are stored
with the agent's own fields and a template note.

## Deploy
1. Supabase → SQL editor → run `supabase/schema.sql`.
2. `npx vercel` (link the project), then add every variable from `.env.example` in Vercel → Settings → Environment Variables.
3. `npx vercel --prod`. Set `APP_URL` to the production URL and redeploy.
4. Open `/setup`, copy the webhook URL, tool definitions and agent prompt into Vaani.
5. Run the samples on `/simulate`, then place a real test call.
