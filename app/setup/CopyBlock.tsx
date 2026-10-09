"use client";

import { useState } from "react";

export default function CopyBlock({ text, tall }: { text: string; tall?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <pre className="note" style={{ maxHeight: tall ? 520 : 260, overflow: "auto", paddingRight: 80 }}>{text}</pre>
      <button
        className="ghost"
        style={{ position: "absolute", top: 8, right: 8, background: "#fff", padding: "4px 10px", fontSize: 13 }}
        onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
