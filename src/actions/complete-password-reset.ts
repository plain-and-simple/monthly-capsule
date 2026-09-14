"use server";

import { redirect } from "next/navigation";
import { manageDestination, managePath } from "@/lib/account";
import { RESET_LINK_INVALID } from "@/lib/copy";
import { listAccountGroups, updateAccountPassword } from "@/lib/memberships";
import { hashPassword } from "@/lib/password";
import { parseResetPassword } from "@/lib/password-reset";
import { consumeAccountResetTokens, peekPasswordReset } from "@/lib/password-reset-store";
import { setAccountSession, setSession } from "@/lib/session";

export type CompletePasswordResetState = { error: string } | null;

export async function completePasswordReset(
  _prev: CompletePasswordResetState,
  formData: FormData,
): Promise<CompletePasswordResetState> {
  const parsed = parseResetPassword(String(formData.get("password") ?? ""));
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const token = String(formData.get("token") ?? "");
  try {
    const peeked = await peekPasswordReset(token);
    if (!peeked.ok) {
      return { error: RESET_LINK_INVALID };
    }

    const updated = await updateAccountPassword(
      peeked.accountId,
      await hashPassword(parsed.password),
    );
    if (!updated) {
      return { error: RESET_LINK_INVALID };
    }

    await consumeAccountResetTokens(peeked.accountId);
    await setAccountSession({ accountId: peeked.accountId });

    const groups = await listAccountGroups(peeked.accountId);
    const destination = manageDestination(groups.map((row) => row.group.id));
    if (destination.kind === "one") {
      const membership = groups[0]!;
      await setSession({
        memberId: membership.member.id,
        groupId: membership.group.id,
      });
    }

    redirect(managePath(destination));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { error: RESET_LINK_INVALID };
  }
}
