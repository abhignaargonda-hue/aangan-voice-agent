// Two kinds of access:
// - Vaani → webhook / tools: shared secret (header, bearer or ?secret=) or an
//   HMAC-SHA256 signature of the raw body using the same secret.
// - People → dashboard: password cookie (see middleware.ts).

import { createHmac, timingSafeEqual } from "crypto";
import { config } from "./config";

const safeEq = (a: string, b: string) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

export function verifyVaani(req: Request, rawBody: string): boolean {
  const secret = config.webhookSecret;
  if (!secret) return process.env.NODE_ENV !== "production"; // open locally, closed in prod until set

  const url = new URL(req.url);
  const supplied =
    req.headers.get("x-aangan-secret") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("secret") ||
    "";
  if (supplied && safeEq(supplied, secret)) return true;

  const sig = (req.headers.get("x-signature") || req.headers.get("x-vaani-signature") || req.headers.get("x-webhook-signature") || "")
    .replace(/^sha256=/, "")
    .trim();
  if (sig) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (safeEq(sig.toLowerCase(), expected)) return true;
  }
  return false;
}

export const AUTH_COOKIE = "aangan_dash";

export async function dashboardToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`aangan:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
