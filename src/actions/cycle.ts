"use server";

import { revalidatePath } from "next/cache";
import { closedYearMonths, compileGroupMonth, ensureMonth, findGroupCapsule } from "@/lib/compile";
import {
  CYCLE_ALREADY_OPEN,
  CYCLE_ALREADY_SENT,
  CYCLE_COMPILED,
  CYCLE_CONFIRM_CLOSE,
  CYCLE_NO_CAPSULE,
  CYCLE_OWNER_ONLY,
  CYCLE_SENT,
  CYCLE_SKIPPED,
  decideForceClose,
  decideForceEmail,
  decideForceOpen,
  decideForceSkip,
  forceCloseYearMonth,
  isCycleSubmitOpen,
  nextClosedToOpenYearMonth,
} from "@/lib/cycle";
import { holdGroupMonthEmail, sendGroupMonthEmail } from "@/lib/email";
import { forceCloseConfirmAccepted } from "@/lib/manage";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export type ForceOpenState = { error?: string; ok?: boolean; yearMonth?: string } | null;
export type ForceCloseState =
  | {
      error?: string;
      ok?: boolean;
      yearMonth?: string;
      askEmail?: boolean;
      message?: string;
    }
  | null;
export type CycleEmailState = { error?: string; ok?: boolean; message?: string } | null;

function revalidateGroup(groupId: string, yearMonth?: string) {
  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/submit`);
  revalidatePath(`/g/${groupId}/settings`);
  if (yearMonth) {
    revalidatePath(`/g/${groupId}/capsule/${yearMonth}`);
  }
}

function isRedirectError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error);
}

export async function forceOpenSubmit(
  _prev: ForceOpenState,
  formData: FormData,
): Promise<ForceOpenState> {
  const groupId = String(formData.get("groupId") ?? "");

  try {
    const { member, group } = await requireGroupMember(groupId);
    const closed = await closedYearMonths(groupId);
    const decision = decideForceOpen(member.role, isCycleSubmitOpen(group, closed));
    if (decision === "forbidden") return { error: CYCLE_OWNER_ONLY };
    if (decision === "already_open") return { error: CYCLE_ALREADY_OPEN };

    const yearMonth = nextClosedToOpenYearMonth(group, closed);
    const admin = createAdminClient();
    const { error } = await admin
      .from("groups")
      .update({ force_open_year_month: yearMonth })
      .eq("id", groupId);
    if (error) return { error: "Could not open." };

    await ensureMonth(groupId, yearMonth, "open");
    revalidateGroup(groupId);
    return { ok: true, yearMonth };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: "Could not open." };
  }
}

export async function forceCloseCompile(
  _prev: ForceCloseState,
  formData: FormData,
): Promise<ForceCloseState> {
  const groupId = String(formData.get("groupId") ?? "");

  try {
    const { member, group } = await requireGroupMember(groupId);
    const decision = decideForceClose(member.role, forceCloseConfirmAccepted(formData.get("confirm")));
    if (decision === "forbidden") return { error: CYCLE_OWNER_ONLY };
    if (decision === "unconfirmed") return { error: CYCLE_CONFIRM_CLOSE };

    const closed = await closedYearMonths(groupId);
    const yearMonth = forceCloseYearMonth(group, closed);
    const admin = createAdminClient();
    if (group.force_open_year_month) {
      await admin.from("groups").update({ force_open_year_month: null }).eq("id", groupId);
    }

    await compileGroupMonth({ ...group, force_open_year_month: null }, yearMonth);
    const { capsule } = await findGroupCapsule(groupId, yearMonth);
    revalidateGroup(groupId, yearMonth);
    return {
      ok: true,
      yearMonth,
      askEmail: Boolean(capsule && !capsule.email_sent_at),
      message: CYCLE_COMPILED,
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: "Could not close." };
  }
}

export async function emailGroupNow(
  _prev: CycleEmailState,
  formData: FormData,
): Promise<CycleEmailState> {
  const groupId = String(formData.get("groupId") ?? "");
  const yearMonth = String(formData.get("yearMonth") ?? "");

  try {
    const { member, group } = await requireGroupMember(groupId);
    const { capsule } = await findGroupCapsule(groupId, yearMonth);
    const decision = decideForceEmail(
      member.role,
      capsule ? { email_sent_at: capsule.email_sent_at as string | null } : null,
    );
    if (decision === "forbidden") return { error: CYCLE_OWNER_ONLY };
    if (decision === "no_capsule") return { error: CYCLE_NO_CAPSULE };
    if (decision === "already_sent") return { error: CYCLE_ALREADY_SENT };

    const result = await sendGroupMonthEmail(group, yearMonth);
    if (result.skipped === "already-sent") return { error: CYCLE_ALREADY_SENT };
    revalidateGroup(groupId, yearMonth);
    return { ok: true, message: CYCLE_SENT };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: "Could not send." };
  }
}

export async function skipGroupEmail(
  _prev: CycleEmailState,
  formData: FormData,
): Promise<CycleEmailState> {
  const groupId = String(formData.get("groupId") ?? "");
  const yearMonth = String(formData.get("yearMonth") ?? "");

  try {
    const { member } = await requireGroupMember(groupId);
    const { capsule } = await findGroupCapsule(groupId, yearMonth);
    const decision = decideForceSkip(
      member.role,
      capsule ? { email_sent_at: capsule.email_sent_at as string | null } : null,
    );
    if (decision === "forbidden") return { error: CYCLE_OWNER_ONLY };
    if (decision === "no_capsule") return { error: CYCLE_NO_CAPSULE };
    if (decision === "already_sent") return { error: CYCLE_ALREADY_SENT };

    const held = await holdGroupMonthEmail(groupId, yearMonth);
    if (!held.ok && held.reason === "already-sent") return { error: CYCLE_ALREADY_SENT };
    if (!held.ok) return { error: "Could not skip." };
    revalidateGroup(groupId, yearMonth);
    return { ok: true, message: CYCLE_SKIPPED };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: "Could not skip." };
  }
}
