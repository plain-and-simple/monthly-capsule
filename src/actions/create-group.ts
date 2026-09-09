"use server";

import { appUrl } from "@/lib/env";
import { generatePin, hashPin } from "@/lib/pin";
import { setSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type CreateState =
  | { ok: true; groupId: string; pin: string; shareUrl: string }
  | { ok: false; error: string }
  | null;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function createGroup(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (name.length > 40) {
    return { ok: false, error: "Name is too long." };
  }
  if (!email || !email.includes("@") || email.length > 254) {
    return { ok: false, error: "Owner email required." };
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

  const displayName = email.split("@")[0] || "Owner";
  const { data: member, error: memberError } = await admin
    .from("members")
    .insert({
      group_id: group.id,
      display_name: displayName,
      email,
      role: "owner",
    })
    .select("id")
    .single();

  if (memberError || !member) {
    return { ok: false, error: "Could not create owner." };
  }

  await setSession({ memberId: member.id, groupId: group.id });

  return {
    ok: true,
    groupId: group.id,
    pin,
    shareUrl: `${appUrl()}/join/${group.id}`,
  };
}
