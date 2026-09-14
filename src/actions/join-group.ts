"use server";

import { redirect } from "next/navigation";
import {
  JOIN_ACCOUNT_REQUIRED,
  PREFERRED_NAME_REQUIRED,
  parseJoinIntent,
  parsePreferredName,
} from "@/lib/account";
import { parseGroupId } from "@/lib/group-id";
import { JOIN_RATE_LIMITED, pinJoinError, pinJoinOutcome } from "@/lib/manage";
import { linkMembership } from "@/lib/memberships";
import { verifyPin } from "@/lib/pin";
import { clientIp, pinAttemptsBlocked, recordPinAttempt } from "@/lib/rate-limit";
import { getAccountSession, setSession } from "@/lib/session";
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
    if (!account) {
      return { error: JOIN_ACCOUNT_REQUIRED };
    }

    const intent = parseJoinIntent({ preferred_name: preferredNameInput });
    const preferredName =
      ("error" in intent ? null : intent.preferredName) ??
      parsePreferredName(account.preferred_name);
    if (!preferredName) {
      return { error: ("error" in intent ? intent.error : PREFERRED_NAME_REQUIRED) };
    }

    const member = await linkMembership({
      account,
      groupId,
      preferredName,
    });
    if ("error" in member) {
      return { error: member.error };
    }

    await setSession({ memberId: member.id, groupId });
    redirect(`/g/${groupId}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { error: "Could not join." };
  }
}
