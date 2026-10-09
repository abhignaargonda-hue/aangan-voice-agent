import { config } from "./config";
import type { CallRow } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function send(chatId: string, html: string) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Designer handoff for QUALIFIED / QUALIFIED_FLAGGED.
export async function sendHandoff(row: CallRow) {
  const head = row.route === "QUALIFIED_FLAGGED" ? "🟡 New qualified enquiry (flagged)" : "🟢 New qualified enquiry";
  const test = row.is_test ? "🧪 TEST — " : "";
  const link = `${config.appUrl}/calls/${row.id}`;
  const html = `<b>${test}${head}</b>\n\n${esc(row.handoff_note || row.summary || "")}\n\n<a href="${link}">Open call and transcript</a>`;
  await send(config.telegramDesignerChatId, html);
}

// Urgent alert for an existing client's complaint (ESCALATE).
export async function sendEscalation(row: CallRow) {
  const chat = config.telegramEscalationChatId || config.telegramDesignerChatId;
  const test = row.is_test ? "🧪 TEST — " : "";
  const link = `${config.appUrl}/calls/${row.id}`;
  const html = `<b>${test}🔴 URGENT — existing client complaint</b>\nCaller was promised: ${esc(config.escalationCallbackPromise)}.\n\n${esc(row.handoff_note || row.summary || "")}\n\nCaller: ${esc(row.caller_name ?? "unknown")} · ${esc(row.caller_phone || "no number")}\n<a href="${link}">Open call</a>`;
  await send(chat, html);
}
