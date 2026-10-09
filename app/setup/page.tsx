import { agentPrompt, toolDefinitions } from "@/lib/agentPrompt";
import { config, integrations } from "@/lib/config";
import { storageMode } from "@/lib/store";
import { Fragment } from "react";
import CopyBlock from "./CopyBlock";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  gemini: "Gemini (structuring + handoff note)",
  supabase: "Supabase (call log)",
  telegram: "Telegram (designer handoff)",
  telegramEscalation: "Telegram (escalations)",
  hubspot: "HubSpot (founder pipeline)",
  calcom: "Cal.com (booking during the call)",
  webhookSecret: "Vaani webhook secret",
  dashboardPassword: "Dashboard password",
};

export default function Setup() {
  const status = integrations();
  const base = config.appUrl;
  const secretQs = config.webhookSecret ? "?secret=<VAANI_WEBHOOK_SECRET>" : "";
  return (
    <>
      <h1>Setup</h1>
      <p className="sub">What is connected, and what to paste into Vaani.</p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Connections</h2>
        <dl className="kv">
          {Object.entries(status).map(([k, v]) => (
            <Fragment key={k}><dt>{LABELS[k] ?? k}</dt><dd className={v ? "ok" : "no"}>{v ? "connected" : "not set"}</dd></Fragment>
          ))}
          <dt>Storage in use</dt><dd>{storageMode()}</dd>
        </dl>
      </div>

      <h2>1 · Vaani end-of-call webhook</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>In Vaani, add a webhook for the call-completed event, pointing to:</p>
        <CopyBlock text={`${base}/api/vaani/webhook${secretQs}`} />
        <p className="muted">Or send the secret as an <code>x-aangan-secret</code> header, or use Vaani's signing secret (HMAC-SHA256 of the body) with the same value.</p>
      </div>

      <h2>2 · Agent tools (custom functions)</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>Add these two functions to the agent. Send the same secret as a header or query parameter.</p>
        <CopyBlock text={JSON.stringify(toolDefinitions(base), null, 2)} />
      </div>

      <h2>3 · Agent prompt</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>Paste this as the agent's system prompt. Open decisions (assistant name, escalation promise, commercial minimum, languages) come from environment variables.</p>
        <CopyBlock text={agentPrompt()} tall />
      </div>
    </>
  );
}
