"use server";

import { redirect } from "next/navigation";
import { parseJoinIntent, parsePreferredName, wantsSaveLogin } from "@/lib/account";
import { parseGroupId } from "@/lib/group-id";
import { JOIN_RATE_LIMITED, pinJoinError, pinJoinOutcome } from "@/lib/manage";
import { createAccount, linkMembership } from "@/lib/memberships";
import { verifyPin } from "@/lib/pin";
import { clientIp, pinAttemptsBlocked, recordPinAttempt } from "@/lib/rate-limit";
import { getAccountSession, setAccountSession, setSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";
import type { Account } from "@/lib/types";

export type JoinState = { error: string } | null;

export async function joinGroup(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const groupId = parseGroupId(String(formData.get("uuid") ?? "")) ?? "";
  const pin = String(formData.get("pin") ?? "").trim();
  const preferredNameInput = String(
    formData.get("preferred_name") ?? formData.get("display_name") ?? "",
  );

  if (!/^[0-9a-f-]{36}$/i.test(groupId)) {
    return { error: "Unknown group." };
  }
  if (!/^\d{6}$/.test(pin)) {
    return { error: "PIN is 6 digits." };
  }

  try {
    const ip = await clientIp();
    const blocked = await pinAttemptsBlocked(groupId, ip);
    if (blocked) {
      return { error: JOIN_RATE_LIMITED };
    }

    const admin = createAdminClient();
    const { data: group } = await admin.from("groups").select("*").eq("id", groupId).maybeSingle();
    if (!group) {
      return { error: "Unknown group." };
    }

    await recordPinAttempt(groupId, ip);
    const ok = await verifyPin(pin, group.pin_hash);
    const pinError = pinJoinError(pinJoinOutcome(false, ok));
    if (pinError) {
      return { error: pinError };
    }

    const accountSession = await getAccountSession();
    let account: Account | null = null;
    if (accountSession) {
      const { data } = await admin
        .from("accounts")
        .select("*")
        .eq("id", accountSession.accountId)
        .maybeSingle();
      account = (data as Account | null) ?? null;
    }

    let memberId: string | null = null;

    if (account) {
      const preferredName =
        parsePreferredName(preferredNameInput) ?? account.preferred_name;
      const member = await linkMembership({
        account,
        groupId,
        preferredName,
      });
      if ("error" in member) {
        return { error: member.error };
      }
      memberId = member.id;
    } else {
      const intent = parseJoinIntent({
        preferred_name: preferredNameInput,
        save_login: wantsSaveLogin(formData.get("save_login")),
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      if ("error" in intent) {
        return { error: intent.error };
      }

      if (intent.mode === "save_login") {
        const created = await createAccount({
          preferredName: intent.preferredName,
          email: intent.email,
          password: intent.password,
        });
        if ("error" in created) {
          return { error: created.error };
        }
        account = created;
        const member = await linkMembership({
          account,
          groupId,
          preferredName: intent.preferredName,
        });
        if ("error" in member) {
          return { error: member.error };
        }
        memberId = member.id;
        await setAccountSession({ accountId: account.id });
      } else {
        const { data: inserted, error } = await admin
          .from("members")
          .insert({
            group_id: groupId,
            preferred_name: intent.preferredName,
            email: null,
            role: "member",
            account_id: null,
          })
          .select("id")
          .single();

        if (error || !inserted) {
          return { error: "Could not join." };
        }
        memberId = inserted.id;
      }
    }

    if (!memberId) {
      return { error: "Could not join." };
    }

    await setSession({ memberId, groupId });
    redirect(`/g/${groupId}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { error: "Could not join." };
  }
}
