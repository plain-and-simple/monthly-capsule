"use server";

import { parseCreateAccount } from "@/lib/account";
import { appUrl, createGroupCode } from "@/lib/env";
import { createAccount, linkMembership } from "@/lib/memberships";
import { generatePin, hashPin } from "@/lib/pin";
import { getAccountSession, setAccountSession, setSession } from "@/lib/session";
import { rejectInvalidStudioCode } from "@/lib/studio-code";
import { createAdminClient } from "@/lib/supabase";
import type { Account } from "@/lib/types";

export type CreateState =
  | { ok: true; groupId: string; groupName: string; pin: string; shareUrl: string }
  | { ok: false; error: string }
  | null;

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
      .insert({ name, pin_hash: pinHash })
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
