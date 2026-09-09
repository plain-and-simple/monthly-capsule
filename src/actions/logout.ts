"use server";

import { redirect } from "next/navigation";
import { clearAccountSession } from "@/lib/session";

export async function logoutAccount() {
  await clearAccountSession();
  redirect("/");
}
