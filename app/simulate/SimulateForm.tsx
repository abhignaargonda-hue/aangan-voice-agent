"use client";

import { useState } from "react";
import type { Sample } from "@/lib/samples";

interface Result { id: string; route: string; error: string | null; expected?: string; label: string }

export default function SimulateForm({ samples }: { samples: Sample[] }) {
  const [pick, setPick] = useState(samples[0].id);
  const current = samples.find((s) => s.id === pick);
  const [text, setText] = useState(samples[0].transcript);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  async function run(s: { transcript: string; started_at?: string; label: string; expected?: string }) {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: s.transcript, started_at: s.started_at }),
    });
    const j = await res.json();
    return { id: j.id, route: j.route ?? "error", error: j.error ?? (res.ok ? null : JSON.stringify(j)), expected: s.expected, label: s.label } as Result;
  }

  async function runOne() {
    setBusy(true);
    const edited = current && text === current.transcript;
    const r = await run({ transcript: text, started_at: edited ? current?.started_at : undefined, label: edited ? `${current!.id} · ${current!.label}` : "Custom transcript", expected: edited ? current?.expected : undefined });
    setResults((x) => [r, ...x]);
    setBusy(false);
  }

  async function runAll() {
    setBusy(true);
    for (const s of samples) {
      const r = await run({ ...s, label: `${s.id} · ${s.label}` });
      setResults((x) => [r, ...x]);
    }
    setBusy(false);
  }

  return (
    <div className="grid2">
      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <label>
          Sample from September's calls
          <select value={pick} onChange={(e) => { setPick(e.target.value); setText(samples.find((s) => s.id === e.target.value)?.transcript ?? ""); }}>
            {samples.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.label} (expect {s.expected})</option>)}
          </select>
        </label>
        <textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={runOne} disabled={busy || !text.trim()}>{busy ? "Running…" : "Run this call"}</button>
          <button className="ghost" onClick={runAll} disabled={busy}>Run all {samples.length} samples</button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Write lines as <code>Agent: …</code> and <code>Caller: …</code> so the price and budget checks can tell who said what.</p>
      </div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Results</h2>
        {results.length === 0 && <p className="muted">Nothing run yet.</p>}
        <table>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td style={{ paddingLeft: 0 }}>{r.id ? <a href={`/calls/${r.id}`}>{r.label}</a> : r.label}{r.error && <div className="no" style={{ fontSize: 12 }}>{r.error}</div>}</td>
                <td><span className={`badge r-${r.route}`}>{r.route}</span></td>
                <td>{r.expected ? (r.expected === r.route ? <span className="ok">✓ expected</span> : <span className="no">expected {r.expected}</span>) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
