import "server-only";
import { ACCOUNT_EXISTS, accountIsBanned } from "@/lib/account";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase";
import type { Account, Group, Member } from "@/lib/types";

export type AccountGroup = {
  group: Group;
  member: Member;
};

export async function listAccountGroups(accountId: string): Promise<AccountGroup[]> {
  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("members")
    .select("*")
    .eq("account_id", accountId)
    .is("removed_at", null)
    .order("joined_at", { ascending: true });

  if (error || !members || members.length === 0) {
    return [];
  }

  const groupIds = members.map((row) => row.group_id as string);
  const { data: groups } = await admin.from("groups").select("*").in("id", groupIds);
  const groupById = new Map(((groups ?? []) as Group[]).map((group) => [group.id, group]));

  return (members as Member[])
    .map((member) => {
      const group = groupById.get(member.group_id);
      return group ? { group, member } : null;
    })
    .filter((row): row is AccountGroup => row !== null);
}

export async function findAccountByEmail(email: string): Promise<Account | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("accounts").select("*").eq("email", email).maybeSingle();
  return (data as Account | null) ?? null;
}

export async function findAccountById(accountId: string): Promise<Account | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("accounts").select("*").eq("id", accountId).maybeSingle();
  return (data as Account | null) ?? null;
}

export async function createAccount(input: {
  preferredName: string;
  email: string;
  password: string;
}): Promise<Account | { error: string }> {
  const existing = await findAccountByEmail(input.email);
  if (existing) {
    if (accountIsBanned(existing)) {
      return { error: ACCOUNT_EXISTS };
    }
    const ok = await verifyPassword(input.password, existing.password_hash);
    if (!ok) {
      return { error: ACCOUNT_EXISTS };
    }
    return existing;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .insert({
      preferred_name: input.preferredName,
      email: input.email,
      password_hash: await hashPassword(input.password),
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: "Could not create account." };
  }
  return data as Account;
}

export async function authenticateAccount(
  email: string,
  password: string,
): Promise<Account | null> {
  const account = await findAccountByEmail(email);
  if (!account) return null;
  if (accountIsBanned(account)) return null;
  const ok = await verifyPassword(password, account.password_hash);
  return ok ? account : null;
}

export async function banAccountByEmail(email: string): Promise<Account | { error: string }> {
  const account = await findAccountByEmail(email);
  if (!account) {
    return { error: "Unknown account." };
  }
  if (accountIsBanned(account)) {
    return { error: "Already banned." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .update({ banned_at: new Date().toISOString() })
    .eq("id", account.id)
    .is("banned_at", null)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { error: "Could not ban." };
  }
  return data as Account;
}

export async function updateAccountPassword(
  accountId: string,
  passwordHash: string,
): Promise<Account | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .update({ password_hash: passwordHash })
    .eq("id", accountId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as Account;
}

export async function linkMembership(input: {
  account: Account;
  groupId: string;
  preferredName: string;
  role?: Member["role"];
}): Promise<Member | { error: string }> {
  const admin = createAdminClient();

  const { data: byAccount } = await admin
    .from("members")
    .select("*")
    .eq("group_id", input.groupId)
    .eq("account_id", input.account.id)
    .is("removed_at", null)
    .maybeSingle();

  if (byAccount) {
    const { data: updated, error } = await admin
      .from("members")
      .update({
        preferred_name: input.preferredName,
        email: input.account.email,
      })
      .eq("id", byAccount.id)
      .select("*")
      .single();
    if (error || !updated) {
      return { error: "Could not join." };
    }
    return updated as Member;
  }

  const { data: byEmail } = await admin
    .from("members")
    .select("*")
    .eq("group_id", input.groupId)
    .eq("email", input.account.email)
    .is("removed_at", null)
    .maybeSingle();

  if (byEmail) {
    const { data: updated, error } = await admin
      .from("members")
      .update({
        account_id: input.account.id,
        preferred_name: input.preferredName,
        email: input.account.email,
      })
      .eq("id", byEmail.id)
      .select("*")
      .single();
    if (error || !updated) {
      return { error: "Could not join." };
    }
    return updated as Member;
  }

  const { data: inserted, error } = await admin
    .from("members")
    .insert({
      group_id: input.groupId,
      preferred_name: input.preferredName,
      email: input.account.email,
      role: input.role ?? "member",
      account_id: input.account.id,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return { error: "Could not join." };
  }
  return inserted as Member;
}

