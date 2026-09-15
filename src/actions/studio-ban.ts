"use server";

import { parseEmail } from "@/lib/account";
import { STUDIO_BAN_DONE } from "@/lib/copy";
import { banAccountByEmail } from "@/lib/memberships";
import { banConfirmAccepted } from "@/lib/studio-admin";
import { getStudioSession } from "@/lib/studio-session";

export type StudioBanState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function banStudioAccount(
  _prev: StudioBanState,
  formData: FormData,
): Promise<StudioBanState> {
  const studio = await getStudioSession();
  if (!studio) {
    return { ok: false, error: "Studio only." };
  }
  if (!banConfirmAccepted(formData.get("confirm"))) {
    return { ok: false, error: "Confirm to ban." };
  }

  const email = parseEmail(String(formData.get("email") ?? ""));
  if (!email) {
    return { ok: false, error: "Email looks wrong." };
  }

  const result = await banAccountByEmail(email);
  if ("error" in result) {
    return { ok: false, error: result.error };
  }

  return { ok: true, message: STUDIO_BAN_DONE };
}
