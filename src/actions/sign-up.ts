"use server";

import { redirect } from "next/navigation";
import { parseCreateAccount } from "@/lib/account";
import { createAccount } from "@/lib/memberships";
import { parseReturnPath } from "@/lib/return-path";
import { setAccountSession } from "@/lib/session";

export type SignUpState = { error: string } | null;

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = parseCreateAccount({
    preferred_name: String(formData.get("preferred_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  try {
    const account = await createAccount({
      preferredName: parsed.preferredName,
      email: parsed.email,
      password: parsed.password,
    });
    if ("error" in account) {
      return { error: account.error };
    }

    await setAccountSession({ accountId: account.id });
    const next = parseReturnPath(String(formData.get("next") ?? ""));
    redirect(next ?? "/manage");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { error: "Could not create account." };
  }
}
