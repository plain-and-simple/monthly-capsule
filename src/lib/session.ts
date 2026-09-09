import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ACCOUNT_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { cookieSecret } from "@/lib/env";
import { sessionCookieOptions } from "@/lib/hosting";
import { decideAccountSession } from "@/lib/session-policy";
import { createAdminClient } from "@/lib/supabase";
import type { Account, AccountSessionPayload, Group, Member, SessionPayload } from "@/lib/types";

export async function setSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({
    memberId: payload.memberId,
    groupId: payload.groupId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("400d")
    .sign(cookieSecret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(process.env.NODE_ENV === "production"));
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, cookieSecret());
    const memberId = payload.memberId;
    const groupId = payload.groupId;
    if (typeof memberId !== "string" || typeof groupId !== "string") {
      return null;
    }
    return { memberId, groupId };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(process.env.NODE_ENV === "production"),
    maxAge: 0,
  });
}

export const requireGroupMember = cache(async (groupId: string): Promise<{
  member: Member;
  group: Group;
}> => {
  const session = await getSession();
  if (!session || session.groupId !== groupId) {
    redirect(`/join/${groupId}`);
  }

  const admin = createAdminClient();
  const [{ data: member }, { data: group }] = await Promise.all([
    admin.from("members").select("*").eq("id", session.memberId).maybeSingle(),
    admin.from("groups").select("*").eq("id", groupId).maybeSingle(),
  ]);

  if (!member || member.group_id !== groupId || !group) {
    redirect(`/join/${groupId}`);
  }

  return {
    member: member as Member,
    group: group as Group,
  };
});

export async function requireOwner(groupId: string) {
  const ctx = await requireGroupMember(groupId);
  if (ctx.member.role !== "owner") {
    redirect(`/g/${groupId}`);
  }
  return ctx;
}

export async function setAccountSession(payload: AccountSessionPayload): Promise<void> {
  const token = await new SignJWT({ accountId: payload.accountId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("400d")
    .sign(cookieSecret());

  const jar = await cookies();
  jar.set(ACCOUNT_COOKIE, token, sessionCookieOptions(process.env.NODE_ENV === "production"));
}

export async function getAccountSession(): Promise<AccountSessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(ACCOUNT_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, cookieSecret());
    const accountId = payload.accountId;
    if (typeof accountId !== "string") {
      return null;
    }
    return { accountId };
  } catch {
    return null;
  }
}

export async function clearAccountSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ACCOUNT_COOKIE, "", {
    ...sessionCookieOptions(process.env.NODE_ENV === "production"),
    maxAge: 0,
  });
}

export async function getAccount(): Promise<Account | null> {
  const jar = await cookies();
  const cookiePresent = Boolean(jar.get(ACCOUNT_COOKIE)?.value);
  const session = await getAccountSession();

  let account: Account | null = null;
  if (session) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("*")
      .eq("id", session.accountId)
      .maybeSingle();
    account = (data as Account | null) ?? null;
  }

  const decision = decideAccountSession({
    cookiePresent,
    payloadValid: Boolean(session),
    accountFound: Boolean(account),
  });
  if (decision.action === "anonymous") {
    return null;
  }
  if (decision.action === "clear_via_route") {
    redirect(decision.path);
  }

  return account as Account;
}

export async function requireAccount(): Promise<Account> {
  const account = await getAccount();
  if (!account) {
    redirect("/");
  }
  return account;
}
