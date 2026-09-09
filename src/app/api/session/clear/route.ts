import { redirect } from "next/navigation";
import { clearAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Route Handler: safe place to expire a stale or invalid account cookie. */
export async function GET() {
  await clearAccountSession();
  redirect("/");
}
