import { NextResponse } from "next/server";
import { AUTH_COOKIE, dashboardToken } from "@/lib/auth";
import { config } from "@/lib/config";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!config.dashboardPassword || password !== config.dashboardPassword) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNext)}`, req.url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(AUTH_COOKIE, await dashboardToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
