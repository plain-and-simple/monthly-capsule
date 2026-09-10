import { parseEmail } from "@/lib/account";

export type RecipientInput = {
  memberEmail: string | null | undefined;
  accountEmail: string | null | undefined;
};

export type ResolvedRecipients = {
  emails: string[];
  skippedNoEmail: number;
};

/** Member address first; linked account email when the seat has none. Deduped. */
export function resolveCapsuleRecipients(members: readonly RecipientInput[]): ResolvedRecipients {
  const seen = new Set<string>();
  const emails: string[] = [];
  let skippedNoEmail = 0;

  for (const member of members) {
    const email = parseEmail(member.memberEmail ?? "") ?? parseEmail(member.accountEmail ?? "");
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return { emails, skippedNoEmail };
}
