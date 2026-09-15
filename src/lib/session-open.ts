import "server-only";
import {
  JOIN_ACCOUNT_REQUIRED,
  LOGIN_RATE_LIMITED,
  LOGIN_WRONG,
  PREFERRED_NAME_REQUIRED,
  manageDestination,
  managePath,
  parseCreateAccount,
  parseJoinIntent,
  parseManageLogin,
  parsePreferredName,
} from "@/lib/account";
import { parseGroupId } from "@/lib/group-id";
import { JOIN_RATE_LIMITED, pinJoinError, pinJoinOutcome } from "@/lib/manage";
import {
  authenticateAccount,
  createAccount,
  linkMembership,
  listAccountGroups,
} from "@/lib/memberships";
import { verifyPin } from "@/lib/pin";
import { clientIp, loginAttemptsBlocked, pinAttemptsBlocked, recordLoginAttempt, recordPinAttempt } from "@/lib/rate-limit";
import { parseAuthFormReturn, parseMembershipNext, parseReturnPath } from "@/lib/return-path";
import { getAccountSession, getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";
import type { Account, SessionPayload } from "@/lib/types";

export type SessionOpenResult =
  | { ok: true; path: string; account?: { accountId: string }; session?: SessionPayload; clearSession?: boolean }
  | { ok: false; error: string; path: string };

function formReturn(formData: FormData, fallback: string): string {
  const back = parseAuthFormReturn(String(formData.get("return") ?? "")) ?? fallback;
  const next = parseReturnPath(String(formData.get("next") ?? ""));
  if (!next) return back;
  const params = new URLSearchParams();
  params.set("next", next);
  return `${back}?${params}`;
}

export async function planManageLogin(formData: FormData): Promise<SessionOpenResult> {
  const back = formReturn(formData, "/");
  const next = parseReturnPath(String(formData.get("next") ?? ""));
  const parsed = parseManageLogin({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, path: back };
  }

  const ip = await clientIp();
  if (await loginAttemptsBlocked(parsed.email, ip)) {
    return { ok: false, error: LOGIN_RATE_LIMITED, path: back };
  }
  await recordLoginAttempt(parsed.email, ip);

  const account = await authenticateAccount(parsed.email, parsed.password);
  if (!account) {
    return { ok: false, error: LOGIN_WRONG, path: back };
  }

  if (next) {
    return { ok: true, path: next, account: { accountId: account.id } };
  }

  const groups = await listAccountGroups(account.id);
  const destination = manageDestination(groups.map((row) => row.group.id));
  if (destination.kind === "one") {
    const membership = groups[0]!;
    return {
      ok: true,
      path: managePath(destination),
      account: { accountId: account.id },
      session: { memberId: membership.member.id, groupId: membership.group.id },
    };
  }

  return {
    ok: true,
    path: managePath(destination),
    account: { accountId: account.id },
  };
}

export async function planSignUp(formData: FormData): Promise<SessionOpenResult> {
  const back = formReturn(formData, "/");
  const parsed = parseCreateAccount({
    preferred_name: String(formData.get("preferred_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, path: back };
  }

  const account = await createAccount({
    preferredName: parsed.preferredName,
    email: parsed.email,
    password: parsed.password,
  });
  if ("error" in account) {
    return { ok: false, error: account.error, path: back };
  }

  const next = parseReturnPath(String(formData.get("next") ?? ""));
  return {
    ok: true,
    path: next ?? "/manage",
    account: { accountId: account.id },
  };
}

export async function planJoinGroup(formData: FormData): Promise<SessionOpenResult> {
  const groupId = parseGroupId(String(formData.get("uuid") ?? "")) ?? "";
  const back = formReturn(formData, groupId ? `/join/${groupId}` : "/join");
  const pin = String(formData.get("pin") ?? "").trim();
  const preferredNameInput = String(
    formData.get("preferred_name") ?? formData.get("display_name") ?? "",
  );

  if (!/^[0-9a-f-]{36}$/i.test(groupId)) {
    return { ok: false, error: "Unknown group.", path: back };
  }
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: "PIN is 6 digits.", path: back };
  }

  const ip = await clientIp();
  if (await pinAttemptsBlocked(groupId, ip)) {
    return { ok: false, error: JOIN_RATE_LIMITED, path: back };
  }

  const admin = createAdminClient();
  const { data: group } = await admin.from("groups").select("*").eq("id", groupId).maybeSingle();
  if (!group) {
    return { ok: false, error: "Unknown group.", path: back };
  }

  await recordPinAttempt(groupId, ip);
  const ok = await verifyPin(pin, group.pin_hash);
  const pinError = pinJoinError(pinJoinOutcome(false, ok));
  if (pinError) {
    return { ok: false, error: pinError, path: back };
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
    return { ok: false, error: JOIN_ACCOUNT_REQUIRED, path: back };
  }

  const intent = parseJoinIntent({ preferred_name: preferredNameInput });
  const preferredName =
    ("error" in intent ? null : intent.preferredName) ?? parsePreferredName(account.preferred_name);
  if (!preferredName) {
    return {
      ok: false,
      error: "error" in intent ? intent.error : PREFERRED_NAME_REQUIRED,
      path: back,
    };
  }

  const member = await linkMembership({
    account,
    groupId,
    preferredName,
  });
  if ("error" in member) {
    return { ok: false, error: member.error, path: back };
  }

  return {
    ok: true,
    path: `/g/${groupId}`,
    session: { memberId: member.id, groupId },
  };
}

export async function planSaveLogin(formData: FormData): Promise<SessionOpenResult> {
  const groupId = String(formData.get("groupId") ?? "");
  const next = parseMembershipNext(groupId, String(formData.get("next") ?? ""));
  const back = next ?? (groupId ? `/g/${groupId}` : "/manage");

  const session = await getSession();
  if (!session || session.groupId !== groupId) {
    return { ok: false, error: "Sign in again.", path: groupId ? `/join/${groupId}` : "/join" };
  }

  const admin = createAdminClient();
  const { data: member } = await admin.from("members").select("*").eq("id", session.memberId).maybeSingle();
  if (!member || member.group_id !== groupId) {
    return { ok: false, error: "Sign in again.", path: "/manage" };
  }

  if (member.account_id) {
    return { ok: true, path: back };
  }

  const parsed = parseCreateAccount({
    preferred_name: member.preferred_name,
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, path: back };
  }

  const account = await createAccount({
    preferredName: member.preferred_name,
    email: parsed.email,
    password: parsed.password,
  });
  if ("error" in account) {
    return { ok: false, error: account.error, path: back };
  }

  const { error } = await admin
    .from("members")
    .update({
      account_id: account.id,
      email: account.email,
      preferred_name: member.preferred_name,
    })
    .eq("id", member.id);

  if (error) {
    return { ok: false, error: "Could not save login.", path: back };
  }

  return {
    ok: true,
    path: back,
    account: { accountId: account.id },
  };
}

export function planLeave(hasAccount: boolean): { path: string; clearSession: true } {
  return { path: hasAccount ? "/manage" : "/", clearSession: true };
}
