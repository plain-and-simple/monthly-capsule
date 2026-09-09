"use server";

import { redirect } from "next/navigation";
import { verifyPin } from "@/lib/pin";
import { clientIp, pinAttemptsBlocked, recordPinAttempt } from "@/lib/rate-limit";
import { setSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type JoinState = { error: string } | null;

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email || null;
}

export async function joinGroup(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const groupId = String(formData.get("uuid") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (!/^[0-9a-f-]{36}$/i.test(groupId)) {
    return { error: "Unknown group." };
  }
  if (!displayName || displayName.length > 40) {
    return { error: "Display name required." };
  }
  if (email && (!email.includes("@") || email.length > 254)) {
    return { error: "Email looks wrong." };
  }
  if (!/^\d{6}$/.test(pin)) {
    return { error: "PIN is 6 digits." };
  }

  const ip = await clientIp();
  if (await pinAttemptsBlocked(groupId, ip)) {
    return { error: "Too many tries. Wait a bit." };
  }

  const admin = createAdminClient();
  const { data: group } = await admin.from("groups").select("*").eq("id", groupId).maybeSingle();
  if (!group) {
    return { error: "Unknown group." };
  }

  await recordPinAttempt(groupId, ip);
  const ok = await verifyPin(pin, group.pin_hash);
  if (!ok) {
    return { error: "Wrong PIN." };
  }

  let memberId: string | null = null;

  if (email) {
    const { data: existing } = await admin
      .from("members")
      .select("id")
      .eq("group_id", groupId)
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      memberId = existing.id;
    }
  }

  if (!memberId) {
    const { data: inserted, error } = await admin
      .from("members")
      .insert({
        group_id: groupId,
        display_name: displayName,
        email,
        role: "member",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return { error: "Could not join." };
    }
    memberId = inserted.id;
  }

  if (!memberId) {
    return { error: "Could not join." };
  }

  await setSession({ memberId, groupId });
  redirect(`/g/${groupId}`);
}
