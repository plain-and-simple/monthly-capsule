"use server";

import { revalidatePath } from "next/cache";
import { canKickMember, kickConfirmAccepted } from "@/lib/manage";
import { requireOwner } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";
import type { Member } from "@/lib/types";

export type KickMemberState = { ok: true } | { ok: false; error: string } | null;

function isRedirectError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error);
}

export async function kickMember(
  _prev: KickMemberState,
  formData: FormData,
): Promise<KickMemberState> {
  const groupId = String(formData.get("groupId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");

  try {
    const { member: actor } = await requireOwner(groupId);
    if (!kickConfirmAccepted(formData.get("confirm"))) {
      return { ok: false, error: "Confirm to remove." };
    }

    const admin = createAdminClient();
    const { data: target } = await admin
      .from("members")
      .select("*")
      .eq("id", memberId)
      .eq("group_id", groupId)
      .is("removed_at", null)
      .maybeSingle();

    if (!target) {
      return { ok: false, error: "Unknown member." };
    }

    const seat = target as Member;
    if (
      !canKickMember({
        actorRole: actor.role,
        actorMemberId: actor.id,
        targetRole: seat.role,
        targetMemberId: seat.id,
      })
    ) {
      return { ok: false, error: "Owner only." };
    }

    const { error } = await admin
      .from("members")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", seat.id)
      .eq("group_id", groupId)
      .is("removed_at", null);

    if (error) {
      return { ok: false, error: "Could not remove." };
    }

    revalidatePath(`/g/${groupId}`);
    revalidatePath(`/g/${groupId}/people`);
    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: "Could not remove." };
  }
}
