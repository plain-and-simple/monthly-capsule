import "server-only";
import { createAdminClient } from "@/lib/supabase";
import {
  generateResetToken,
  hashResetToken,
  isResetTokenUsable,
  passwordResetInsert,
} from "@/lib/password-reset";
import { RESET_TOKEN_TTL_MS } from "@/lib/constants";

export async function issuePasswordReset(
  accountId: string,
  now: Date = new Date(),
): Promise<string> {
  const token = generateResetToken();
  const row = passwordResetInsert({
    accountId,
    token,
    now,
    ttlMs: RESET_TOKEN_TTL_MS,
  });
  const admin = createAdminClient();
  const usedAt = now.toISOString();
  await admin
    .from("password_reset_tokens")
    .update({ used_at: usedAt })
    .eq("account_id", accountId)
    .is("used_at", null);
  const { error } = await admin.from("password_reset_tokens").insert(row);
  if (error) {
    throw new Error("Could not create password reset");
  }
  return token;
}

export async function peekPasswordReset(
  token: string,
  now: Date = new Date(),
): Promise<{ ok: true; accountId: string } | { ok: false }> {
  if (!token) {
    return { ok: false };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("password_reset_tokens")
    .select("account_id, expires_at, used_at")
    .eq("token_hash", hashResetToken(token))
    .maybeSingle();
  if (!data) {
    return { ok: false };
  }
  if (
    !isResetTokenUsable(
      { usedAt: data.used_at as string | null, expiresAt: data.expires_at as string },
      now,
    )
  ) {
    return { ok: false };
  }
  return { ok: true, accountId: data.account_id as string };
}

export async function consumeAccountResetTokens(
  accountId: string,
  now: Date = new Date(),
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("password_reset_tokens")
    .update({ used_at: now.toISOString() })
    .eq("account_id", accountId)
    .is("used_at", null);
}

export async function purgeExpiredPasswordResetTokens(): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await admin.from("password_reset_tokens").delete().lt("expires_at", cutoff);
}
