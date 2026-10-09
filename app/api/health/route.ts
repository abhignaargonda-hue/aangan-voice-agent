import { NextResponse } from "next/server";
import { integrations } from "@/lib/config";
import { storageMode } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ ok: true, storage: storageMode(), integrations: integrations() });
}
