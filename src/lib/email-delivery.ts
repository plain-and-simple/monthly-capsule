import "server-only";
import { capsuleDeliveryHash } from "@/lib/email-send";
import { createAdminClient } from "@/lib/supabase";

const UNIQUE_VIOLATION = "23505";

/** True when this caller owns the claim. False when a previous attempt already claimed it. */
export async function claimCapsuleDelivery(capsuleId: string, email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("capsule_email_deliveries").insert({
    capsule_id: capsuleId,
    email_hash: capsuleDeliveryHash(email),
  });
  if (!error) return true;
  if (String(error.code ?? "") === UNIQUE_VIOLATION) return false;
  throw error;
}

export async function releaseCapsuleDelivery(capsuleId: string, email: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("capsule_email_deliveries")
    .delete()
    .eq("capsule_id", capsuleId)
    .eq("email_hash", capsuleDeliveryHash(email));
}
