import Link from "next/link";
import { config } from "@/lib/config";
import { isQualified } from "@/lib/rubric";
import { listCalls, storageMode } from "@/lib/store";
import type { CallRow, Route } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES: Record<string, { label: string; days: number | null }> = {
  "7": { label: "Last 7 days", days: 7 },
  "30": { label: "Last 30 days", days: 30 },
  month: { label: "This month", days: null },
  all: { label: "All time", days: null },
};
const ROUTE_LABEL: Record<Route, string> = {
  QUALIFIED: "Qualified",
  QUALIFIED_FLAGGED: "Qualified + flag",
  NOT_A_FIT: "Not a fit",
  ESCALATE: "Escalated",
  INCOMPLETE: "Incomplete",
  OTHER: "Other",
};
const ROUTE_COLOR: Record<Route, string> = {
  QUALIFIED: "#1f7a4d", QUALIFIED_FLAGGED: "#c98a12", NOT_A_FIT: "#9ca3af",
  ESCALATE: "#a12d2d", INCOMPLETE: "#cbd5e1", OTHER: "#2a4f9c",
};

const inr = (n: number, d = 0) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: config.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

function sinceFor(range: string): string | undefined {
  if (range === "month") {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5.5 * 3600_000).toISOString();
  }
  const d = RANGES[range]?.days;
  return d ? new Date(Date.now() - d * 86400_000).toISOString() : undefined;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const range = sp.range && RANGES[sp.range] ? sp.range : "30";
  const showTests = sp.tests === "1";
  const routeFilter = sp.route as Route | undefined;

  let all: CallRow[] = [];
  let loadError = "";
  try {
    all = await listCalls(sinceFor(range));
  } catch (e: any) {
    loadError = e.message;
  }
  const calls = all.filter((c) => showTests || !c.is_test);

  // Nikhil's numbers: what he pulled by hand last month, now always live.
  const total = calls.length;
  const answered5 = calls.filter((c) => c.answer_seconds === null || c.answer_seconds === undefined || Number(c.answer_seconds) <= 300).length;
  const afterHours = calls.filter((c) => c.after_hours).length;
  const enquiries = calls.filter((c) => !["ESCALATE", "OTHER", "INCOMPLETE"].includes(c.route));
  const qualified = calls.filter((c) => isQualified(c.route));
  const afterHoursQualified = qualified.filter((c) => c.after_hours).length;
  const booked = calls.filter((c) => c.booking_status === "booked").length;
  const toSchedule = calls.filter((c) => c.booking_status === "designer_to_schedule").length;
  const escalations = calls.filter((c) => c.route === "ESCALATE").length;
  const voiceCost = calls.reduce((s, c) => s + Number(c.voice_cost_inr || 0), 0);
  const aiCost = calls.reduce((s, c) => s + Number(c.ai_cost_inr || 0), 0);
  const totalCost = voiceCost + aiCost;
  const minutes = calls.reduce((s, c) => s + Number(c.voice_minutes || 0), 0);
  const ruleFlags = calls.filter((c) => (c.flags ?? []).some((f) => f.startsWith("PRICE RULE") || f.startsWith("BUDGET RULE"))).length;
  const pipelineErrors = calls.filter((c) => c.processing_error).length;

  const byRoute = (Object.keys(ROUTE_LABEL) as Route[]).map((r) => ({ r, n: calls.filter((c) => c.route === r).length }));
  const maxRoute = Math.max(1, ...byRoute.map((x) => x.n));
  const rows = routeFilter ? calls.filter((c) => c.route === routeFilter) : calls;

  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { range, tests: showTests ? "1" : undefined, route: routeFilter, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/?${p}`;
  };

  return (
    <>
      <h1>Every call, answered</h1>
      <p className="sub">
        Live from the call log ({storageMode() === "neon" ? "Neon" : "local test file — set DATABASE_URL before going live"}).
      </p>

      <div className="filters">
        {Object.entries(RANGES).map(([k, v]) => (
          <Link key={k} href={q({ range: k })} className={k === range ? "on" : ""}>{v.label}</Link>
        ))}
        <span style={{ width: 12 }} />
        <Link href={q({ tests: showTests ? undefined : "1" })} className={showTests ? "on" : ""}>
          {showTests ? "Including test calls" : "Live calls only"}
        </Link>
      </div>

      {loadError && <div className="panel no" style={{ marginBottom: 16 }}>Could not load calls: {loadError}</div>}

      <div className="tiles">
        <div className="tile hl"><div className="k">Calls</div><div className="v">{total}</div><div className="n">{minutes} voice minutes</div></div>
        <div className="tile hl"><div className="k">Answered within 5 min</div><div className="v">{pct(answered5, total)}</div><div className="n">target: every call</div></div>
        <div className="tile"><div className="k">After-hours calls</div><div className="v">{afterHours}</div><div className="n">{pct(afterHours, total)} of calls · {afterHoursQualified} qualified</div></div>
        <div className="tile"><div className="k">Qualified</div><div className="v">{pct(qualified.length, enquiries.length)}</div><div className="n">{qualified.length} of {enquiries.length} enquiries</div></div>
        <div className="tile"><div className="k">Consultations booked</div><div className="v">{booked}</div><div className="n">{toSchedule} waiting for a designer to schedule</div></div>
        <div className="tile"><div className="k">Escalations</div><div className="v">{escalations}</div><div className="n">existing-client complaints</div></div>
        <div className="tile hl"><div className="k">Cost per call</div><div className="v">{total ? inr(totalCost / total, 1) : "—"}</div><div className="n">{inr(totalCost)} total in this period</div></div>
        <div className="tile"><div className="k">Cost per qualified lead</div><div className="v">{qualified.length ? inr(totalCost / qualified.length) : "—"}</div><div className="n">voice {inr(voiceCost)} · AI {inr(aiCost, 2)}</div></div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Where calls went</h2>
          <div className="bars">
            {byRoute.map(({ r, n }) => (
              <Link key={r} href={q({ route: routeFilter === r ? undefined : r })} className="bar" style={{ color: "inherit", textDecoration: "none" }}>
                <span>{ROUTE_LABEL[r]}</span>
                <span className="track"><span className="fill" style={{ display: "block", width: `${(n / maxRoute) * 100}%`, background: ROUTE_COLOR[r] }} /></span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Rule watch</h2>
          <dl className="kv">
            <dt>Price or budget rule</dt>
            <dd className={ruleFlags ? "no" : "ok"}>{ruleFlags ? `${ruleFlags} call(s) to review` : "No figures spoken, budget never asked"}</dd>
            <dt>Pipeline errors</dt>
            <dd className={pipelineErrors ? "no" : "ok"}>{pipelineErrors ? `${pipelineErrors} call(s), see call details` : "None"}</dd>
            <dt>Cost basis</dt>
            <dd className="muted">Voice {inr(config.vaaniCostPerMinInr, 2)}/min · Gemini priced by tokens used on each call</dd>
          </dl>
        </div>
      </div>

      <h2>
        Call log {routeFilter && <>· {ROUTE_LABEL[routeFilter]} <Link href={q({ route: undefined })} style={{ fontWeight: 400, fontSize: 13 }}>clear</Link></>}
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>Caller</th><th>Route</th><th>Booking</th><th>Summary</th><th>Sent</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ padding: 24 }}>No calls yet. Connect Vaani, or run a sample from <Link href="/simulate">Test a call</Link>.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link href={`/calls/${c.id}`}>{when(c.started_at)}</Link>
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {c.after_hours && <span className="badge b-ah">after hours</span>}
                    {c.is_test && <span className="badge b-test">test</span>}
                  </div>
                </td>
                <td>
                  <div>{c.caller_name ?? <span className="muted">Unknown</span>}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{[c.caller_phone, c.locality].filter(Boolean).join(" · ")}</div>
                </td>
                <td>
                  <span className={`badge r-${c.route}`}>{ROUTE_LABEL[c.route] ?? c.route}</span>
                  {(c.flags ?? []).some((f) => f.includes("RULE")) && <div><span className="badge b-warn" style={{ marginTop: 4 }}>rule check</span></div>}
                </td>
                <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                  {c.booking_status === "booked" && c.booking?.slot ? when(c.booking.slot) : c.booking_status === "designer_to_schedule" ? "Designer to schedule" : <span className="muted">—</span>}
                </td>
                <td className="summary">{c.processing_status === "received" ? <span className="muted">Processing…</span> : c.summary}</td>
                <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                  {c.alert_sent && <div>Telegram ✓</div>}
                  {c.hubspot_deal_id && <div>HubSpot ✓</div>}
                  {c.processing_error && <div className="no">error</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
