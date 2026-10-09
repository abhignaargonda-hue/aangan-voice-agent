// All environment-driven settings live here. Decisions the sources leave open
// ("[CONFIRM WITH NIKHIL]" in voice-agent-rubric.md) are configurable, not hard-coded.

const env = (key: string, fallback = "") => process.env[key]?.trim() || fallback;
const num = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && process.env[key] !== "" && process.env[key] !== undefined ? v : fallback;
};
const bool = (key: string, fallback: boolean) => {
  const v = process.env[key]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
};

export const config = {
  appUrl: env("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  timezone: env("STUDIO_TIMEZONE", "Asia/Kolkata"),
  officeOpenHour: num("OFFICE_OPEN_HOUR", 10),
  officeCloseHour: num("OFFICE_CLOSE_HOUR", 19),

  // Security
  dashboardPassword: env("DASHBOARD_PASSWORD"),
  webhookSecret: env("VAANI_WEBHOOK_SECRET"),

  // Gemini
  geminiApiKey: env("GEMINI_API_KEY"),
  geminiModel: env("GEMINI_MODEL", "gemini-2.5-flash"),
  geminiInputUsdPerM: num("GEMINI_INPUT_USD_PER_M", 0.3),
  geminiOutputUsdPerM: num("GEMINI_OUTPUT_USD_PER_M", 2.5),
  usdToInr: num("USD_TO_INR", 88),

  // Vaani
  vaaniCostPerMinInr: num("VAANI_COST_PER_MIN_INR", 6),

  // Supabase
  supabaseUrl: env("SUPABASE_URL"),
  supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),

  // Telegram
  telegramBotToken: env("TELEGRAM_BOT_TOKEN"),
  telegramDesignerChatId: env("TELEGRAM_DESIGNER_CHAT_ID"),
  telegramEscalationChatId: env("TELEGRAM_ESCALATION_CHAT_ID"),

  // HubSpot
  hubspotToken: env("HUBSPOT_PRIVATE_APP_TOKEN"),
  hubspotPipeline: env("HUBSPOT_PIPELINE_ID", "default"),
  hubspotDealStage: env("HUBSPOT_DEALSTAGE_CONSULTATION_BOOKED", "appointmentscheduled"),

  // Cal.com
  calcomApiKey: env("CALCOM_API_KEY"),
  calcomEventTypeId: env("CALCOM_EVENT_TYPE_ID"),
  calcomAttendeeEmail: env("CALCOM_ATTENDEE_EMAIL"),

  // Open decisions (rubric section 12)
  assistantName: env("ASSISTANT_NAME", "Aangan Studio's automated assistant"),
  escalationCallbackPromise: env("ESCALATION_CALLBACK_PROMISE", "a senior person will call you back shortly"),
  commercialMinSqft: num("COMMERCIAL_MIN_SQFT", 0), // 0 = no hard minimum; small spaces are flagged
  forwardUnclearAfterOneQuestion: bool("FORWARD_UNCLEAR_AFTER_ONE_QUESTION", true),
  languages: env("AGENT_LANGUAGES", "English"),
};

export const integrations = () => ({
  gemini: !!config.geminiApiKey,
  supabase: !!(config.supabaseUrl && config.supabaseServiceKey),
  telegram: !!(config.telegramBotToken && config.telegramDesignerChatId),
  telegramEscalation: !!(config.telegramBotToken && (config.telegramEscalationChatId || config.telegramDesignerChatId)),
  hubspot: !!config.hubspotToken,
  calcom: !!(config.calcomApiKey && config.calcomEventTypeId),
  webhookSecret: !!config.webhookSecret,
  dashboardPassword: !!config.dashboardPassword,
});
