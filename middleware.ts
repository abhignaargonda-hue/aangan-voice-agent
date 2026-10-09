import { NextResponse, type NextRequest } from "next/server";

// The dashboard shows callers' names, numbers and transcripts, so it sits behind a
// password. Vaani's endpoints use their own secret (lib/auth.ts).
const PUBLIC = ["/login", "/api/login", "/api/vaani", "/api/tools", "/api/health", "/_next", "/favicon"];

async function token(password: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`aangan:${password}`));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Set DASHBOARD_PASSWORD to open the dashboard.", { status: 503 });
  }
  if (req.cookies.get("aangan_dash")?.value === (await token(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
