import "server-only";
import { createHash, timingSafeEqual } from "crypto";

export function authorizeCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const got = createHash("sha256").update(header).digest();
  const want = createHash("sha256").update(`Bearer ${expected}`).digest();
  return timingSafeEqual(got, want);
}
