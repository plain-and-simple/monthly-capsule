"use server";

import { redirect } from "next/navigation";
import {
  LOGIN_RATE_LIMITED,
  LOGIN_WRONG,
  manageDestination,
  managePath,
  parseManageLogin,
} from "@/lib/account";
import { authenticateAccount, listAccountGroups } from "@/lib/memberships";
import { clientIp, loginAttemptsBlocked, recordLoginAttempt } from "@/lib/rate-limit";
import { setAccountSession, setSession } from "@/lib/session";

export type ManageLoginState = { error: string } | null;

export async function manageLogin(
  _prev: ManageLoginState,
  formData: FormData,
): Promise<ManageLoginState> {
  const parsed = parseManageLogin({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  try {
    const ip = await clientIp();
    if (await loginAttemptsBlocked(parsed.email, ip)) {
      return { error: LOGIN_RATE_LIMITED };
    }
    await recordLoginAttempt(parsed.email, ip);

    const account = await authenticateAccount(parsed.email, parsed.password);
    if (!account) {
      return { error: LOGIN_WRONG };
    }

    await setAccountSession({ accountId: account.id });
    const groups = await listAccountGroups(account.id);
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
    return { error: LOGIN_WRONG };
  }
}
