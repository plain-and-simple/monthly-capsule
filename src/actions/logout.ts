"use server";

import { redirect } from "next/navigation";
import { clearAccountSession, clearSession } from "@/lib/session";

export async function logoutAccount() {
  await clearSession();
  await clearAccountSession();
  redirect("/");
}
