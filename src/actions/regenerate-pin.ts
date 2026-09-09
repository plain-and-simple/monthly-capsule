"use server";

import { canRegeneratePin } from "@/lib/manage";
import { generatePin, hashPin } from "@/lib/pin";
import { requireOwner } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type RegenPinState =
  | { ok: true; pin: string }
  | { ok: false; error: string }
  | null;

export async function regeneratePin(
  _prev: RegenPinState,
  formData: FormData,
): Promise<RegenPinState> {
  const groupId = String(formData.get("groupId") ?? "");

  try {
    const { member } = await requireOwner(groupId);
    if (!canRegeneratePin(member.role)) {
      return { ok: false, error: "Owner only." };
    }

    const pin = generatePin();
    const pinHash = await hashPin(pin);
    const admin = createAdminClient();
    const { error } = await admin.from("groups").update({ pin_hash: pinHash }).eq("id", groupId);

    if (error) {
      return { ok: false, error: "Could not regenerate." };
    }

    return { ok: true, pin };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { ok: false, error: "Could not regenerate." };
  }
}
