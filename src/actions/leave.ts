"use server";

import { redirect } from "next/navigation";
import { clearSession, getAccount } from "@/lib/session";

export async function leaveGroup() {
  await clearSession();
  const account = await getAccount();
  redirect(account ? "/manage" : "/");
}
