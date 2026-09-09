import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import {
  LOGIN_ATTEMPT_MAX,
  LOGIN_ATTEMPT_WINDOW_MS,
  PIN_ATTEMPT_MAX,
  PIN_ATTEMPT_WINDOW_MS,
} from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase";

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return h.get("x-real-ip") ?? "unknown";
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export async function pinAttemptsBlocked(groupId: string, ip: string): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - PIN_ATTEMPT_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from("pin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("ip_hash", hashIp(ip))
    .gte("attempted_at", since);

  if (error) {
    throw new Error("Could not check PIN rate limit");
  }
  return (count ?? 0) >= PIN_ATTEMPT_MAX;
}

export async function recordPinAttempt(groupId: string, ip: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("pin_attempts").insert({
    group_id: groupId,
    ip_hash: hashIp(ip),
  });
}

export async function purgeOldPinAttempts(): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await admin.from("pin_attempts").delete().lt("attempted_at", cutoff);
}

export async function loginAttemptsBlocked(emailNorm: string, ip: string): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email_norm", emailNorm)
    .eq("ip_hash", hashIp(ip))
    .gte("attempted_at", since);

  if (error) {
    throw new Error("Could not check login rate limit");
  }
  return (count ?? 0) >= LOGIN_ATTEMPT_MAX;
}

export async function recordLoginAttempt(emailNorm: string, ip: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("login_attempts").insert({
    email_norm: emailNorm,
    ip_hash: hashIp(ip),
  });
}

export async function purgeOldLoginAttempts(): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await admin.from("login_attempts").delete().lt("attempted_at", cutoff);
}
