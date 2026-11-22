"use server";

import { ACCOUNT_BANNED, accountIsBanned, parseCreateAccount } from "@/lib/account";
import {
  DEFAULT_EMAIL_DAY,
  DEFAULT_SUBMIT_END_DAY,
  DEFAULT_SUBMIT_START_DAY,
} from "@/lib/constants";
import { appUrl } from "@/lib/env";
import { parseGroupName } from "@/lib/group-name";
import { createAccount, linkMembership } from "@/lib/memberships";
import { generatePin, hashPin } from "@/lib/pin";
import { validateSchedule } from "@/lib/schedule";
import { accountSessionVersion } from "@/lib/session-policy";
import { getAccountSession, setAccountSession, setSession } from "@/lib/session";
import { rejectStudioAttempt } from "@/lib/studio-gate";
import { createAdminClient } from "@/lib/supabase";
import type { Account } from "@/lib/types";

export type CreateState =
  | { ok: true; groupId: string; groupName: string; pin: string; shareUrl: string }
  | { ok: false; error: string }
  | null;

export async function createGroup(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const codeError = await rejectStudioAttempt(String(formData.get("studio_code") ?? ""));
  if (codeError) {
    return codeError;
  }

  const name = parseGroupName(String(formData.get("name") ?? ""));
  if (typeof name !== "string") {
    return { ok: false, error: name.error };
  }

  const start = Number(formData.get("submit_start_day") || DEFAULT_SUBMIT_START_DAY);
  const end = Number(formData.get("submit_end_day") || DEFAULT_SUBMIT_END_DAY);
  const email = Number(formData.get("email_day") || DEFAULT_EMAIL_DAY);
  const scheduleError = validateSchedule(start, end, email);
  if (scheduleError) {
    return { ok: false, error: scheduleError };
  }

  try {
    const existing = await getAccountSession();
    let account: Account;

    if (existing) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("accounts")
        .select("*")
        .eq("id", existing.accountId)
        .maybeSingle();
      if (!data) {
        return { ok: false, error: "Sign in again." };
      }
      account = data as Account;
      if (accountIsBanned(account)) {
        return { ok: false, error: ACCOUNT_BANNED };
      }
    } else {
      const parsed = parseCreateAccount({
        preferred_name: String(formData.get("preferred_name") ?? ""),
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      if ("error" in parsed) {
        return { ok: false, error: parsed.error };
      }
      const created = await createAccount(parsed);
      if ("error" in created) {
        return { ok: false, error: created.error };
      }
      if (accountIsBanned(created)) {
        return { ok: false, error: ACCOUNT_BANNED };
      }
      account = created;
    }

    const pin = generatePin();
    const pinHash = await hashPin(pin);
    const admin = createAdminClient();

    const { data: group, error: groupError } = await admin
      .from("groups")
      .insert({
        name,
        pin_hash: pinHash,
        submit_start_day: start,
        submit_end_day: end,
        email_day: email,
      })
      .select("id")
      .single();

    if (groupError || !group) {
      return { ok: false, error: "Could not create group." };
    }

    const member = await linkMembership({
      account,
      groupId: group.id,
      preferredName: account.preferred_name,
      role: "owner",
    });
    if ("error" in member) {
      return { ok: false, error: "Could not create owner." };
    }

    const sessionVersion = accountSessionVersion(account);
    await setAccountSession({ accountId: account.id, sessionVersion });
    await setSession({ memberId: member.id, groupId: group.id, sessionVersion });

    return {
      ok: true,
      groupId: group.id,
      groupName: name,
      pin,
      shareUrl: `${appUrl()}/join/${group.id}`,
    };
  } catch {
    return { ok: false, error: "Could not create group." };
  }
}
