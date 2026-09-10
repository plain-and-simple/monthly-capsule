"use server";

import { parseCreateAccount } from "@/lib/account";
import {
  DEFAULT_EMAIL_DAY,
  DEFAULT_SUBMIT_END_DAY,
  DEFAULT_SUBMIT_START_DAY,
} from "@/lib/constants";
import { appUrl, createGroupCode } from "@/lib/env";
import { createAccount, linkMembership } from "@/lib/memberships";
import { generatePin, hashPin } from "@/lib/pin";
import { validateSchedule } from "@/lib/schedule";
import { getAccountSession, setAccountSession, setSession } from "@/lib/session";
import { rejectInvalidStudioCode } from "@/lib/studio-code";
import { createAdminClient } from "@/lib/supabase";
import type { Account } from "@/lib/types";

export type CreateState =
  | { ok: true; groupId: string; groupName: string; pin: string; shareUrl: string }
  | { ok: false; error: string }
  | null;

export type StudioCodeState = { ok: true } | { ok: false; error: string };

export async function checkStudioCode(code: string): Promise<StudioCodeState> {
  const codeError = rejectInvalidStudioCode(code, createGroupCode());
  if (codeError) return codeError;
  return { ok: true };
}

export async function createGroup(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const codeError = rejectInvalidStudioCode(
    String(formData.get("studio_code") ?? ""),
    createGroupCode(),
  );
  if (codeError) {
    return codeError;
  }

  const name = String(formData.get("name") ?? "").trim();
  if (name.length > 40) {
    return { ok: false, error: "Name is too long." };
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

    await setAccountSession({ accountId: account.id });
    await setSession({ memberId: member.id, groupId: group.id });

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
