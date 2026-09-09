"use server";

import { parseCreateAccount } from "@/lib/account";
import { createAccount } from "@/lib/memberships";
import { requireGroupMember, setAccountSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type SaveLoginState = { error?: string; ok?: boolean } | null;

export async function saveLogin(
  _prev: SaveLoginState,
  formData: FormData,
): Promise<SaveLoginState> {
  const groupId = String(formData.get("groupId") ?? "");

  try {
    const { member } = await requireGroupMember(groupId);
    if (member.account_id) {
      return { ok: true };
    }

    const parsed = parseCreateAccount({
      preferred_name: member.preferred_name,
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if ("error" in parsed) {
      return { error: parsed.error };
    }

    const account = await createAccount({
      preferredName: member.preferred_name,
      email: parsed.email,
      password: parsed.password,
    });
    if ("error" in account) {
      return { error: account.error };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("members")
      .update({
        account_id: account.id,
        email: account.email,
        preferred_name: member.preferred_name,
      })
      .eq("id", member.id);

    if (error) {
      return { error: "Could not save login." };
    }

    await setAccountSession({ accountId: account.id });
    return { ok: true };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { error: "Could not save login." };
  }
}
