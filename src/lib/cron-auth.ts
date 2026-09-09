import "server-only";
import { cronSecret } from "@/lib/env";

export function authorizeCron(request: Request): boolean {
  const expected = cronSecret();
  const header = request.headers.get("authorization");
  return header === `Bearer ${expected}`;
}
