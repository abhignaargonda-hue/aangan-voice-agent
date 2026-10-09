import Link from "next/link";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { getCall } from "@/lib/store";
import type { Criteria } from "@/lib/types";

export const dynamic = "force-dynamic";

const CRITERIA: [keyof Criteria, string][] = [
  ["c1_real_project", "1 · Real project, with execution"],
  ["c2_service_area", "2 · Pune or PCMC"],
  ["c3_timeline", "3 · Timeline workable"],
  ["c4_budget", "4 · Budget (only if volunteered)"],
  ["c5_decision_maker", "5 · Decision-maker"],
];
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: config.timezone, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCall(id);
  if (!c) notFound();
  const mins = Math.floor((c.duration_seconds || 0) / 60);
  const secs = (c.duration_seconds || 0) % 60;

  return (
    <>
      <p><Link href="/">← All calls</Link></p>
      <h1>{c.caller_name ?? "Unknown caller"} <span className={`badge r-${c.route}`} style={{ verticalAlign: "middle" }}>{c.route}</span></h1>
      <p className="sub">
        {when(c.started_at)} · {mins}m {secs}s {c.after_hours && <span className="badge b-ah">after hours</span>} {c.is_test && <span className="badge b-test">test</span>}
      </p>

      <div className="grid2">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{c.route === "ESCALATE" ? "Escalation note" : "Designer handoff note"}</h2>
          <pre className="note">{c.handoff_note || "—"}</pre>
          {c.flags?.length > 0 && (
            <>
              <h2>Flags</h2>
              <ul className="flags">
                {c.flags.map((f, i) => <li key={i} className={f.includes("RULE") ? "rule" : ""}>{f}</li>)}
              </ul>
            </>
          )}
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>The five criteria</h2>
          <table>
            <tbody>
              {CRITERIA.map(([k, label]) => {
                const v = c.criteria?.[k];
                return (
                  <tr key={k}>
                    <td style={{ paddingLeft: 0 }}>{label}<div className="muted" style={{ fontSize: 13 }}>{v?.evidence}</div></td>
                    <td className={`c-${v?.result}`} style={{ textAlign: "right" }}>{v?.result ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {c.agent_route && c.agent_route !== c.route && <p className="muted">Agent said {c.agent_route}; system set {c.route}.</p>}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Details</h2>
          <dl className="kv">
            <dt>Phone</dt><dd>{c.caller_phone || "—"}</dd>
            <dt>Call type</dt><dd>{c.call_type}</dd>
            <dt>Property</dt><dd>{[c.size_bhk, c.property_type, c.size_sqft ? `${c.size_sqft} sq ft` : null].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Locality</dt><dd>{c.locality ?? "—"}</dd>
            <dt>Scope</dt><dd>{c.scope_description || "—"}</dd>
            <dt>Site status</dt><dd>{c.site_status ?? "—"}</dd>
            <dt>Complete by</dt><dd>{c.completion_needed_by ?? "—"}</dd>
            <dt>Decision-maker</dt><dd>{c.decision_maker}</dd>
            <dt>Budget volunteered</dt><dd>{c.budget_volunteered ?? "not mentioned"}</dd>
            <dt>Source</dt><dd>{c.source ?? "—"}</dd>
            <dt>Asked about price</dt><dd>{c.price_asked ? "yes" : "no"}</dd>
            <dt>Booking</dt><dd>{c.booking_status === "booked" && c.booking?.slot ? `${when(c.booking.slot)}${c.booking.type ? ` · ${c.booking.type.replace("_", " ")}` : ""}` : c.booking_status.replace(/_/g, " ")}</dd>
          </dl>
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Delivery and cost</h2>
          <dl className="kv">
            <dt>Telegram</dt><dd>{c.alert_sent ? "sent" : "not sent"}</dd>
            <dt>HubSpot</dt><dd>{c.hubspot_deal_id ? `deal ${c.hubspot_deal_id}` : c.is_test ? "skipped (test call)" : "not pushed"}</dd>
            <dt>Voice</dt><dd>{c.voice_minutes} min · ₹{Number(c.voice_cost_inr).toFixed(2)}</dd>
            <dt>Gemini</dt><dd>{c.ai_input_tokens + c.ai_output_tokens} tokens · ₹{Number(c.ai_cost_inr).toFixed(3)}</dd>
            {c.linked_call_id && <><dt>Earlier call</dt><dd><Link href={`/calls/${c.linked_call_id}`}>same number, last 24h</Link></dd></>}
            {(c.raw_payload as any)?.data?.recording_url && <><dt>Recording</dt><dd><a href={(c.raw_payload as any).data.recording_url} target="_blank" rel="noreferrer">Listen</a></dd></>}
            <dt>Vaani call id</dt><dd className="muted" style={{ wordBreak: "break-all" }}>{c.call_id}</dd>
            {c.processing_error && <><dt>Errors</dt><dd className="no">{c.processing_error}</dd></>}
          </dl>
        </div>
      </div>

      <h2>Transcript</h2>
      <pre className="transcript">{c.transcript || "(no transcript)"}</pre>
    </>
  );
}
