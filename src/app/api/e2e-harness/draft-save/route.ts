import { NextResponse } from "next/server";

export async function POST() {
  if (process.env.E2E_HARNESS !== "1") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: "draft" });
}
