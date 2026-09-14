import { parseEmail } from "@/lib/account";

export type RecipientInput = {
  preferredName?: string | null;
  memberEmail: string | null | undefined;
  accountEmail: string | null | undefined;
};

export type ResolvedRecipients = {
  emails: string[];
  skippedNoEmail: number;
  skippedNames: string[];
};

function skippedLabel(member: RecipientInput): string {
  const name = (member.preferredName ?? "").trim();
  return name || "A member";
}

/** Member address first; linked account email when the seat has none. Deduped. */
export function resolveCapsuleRecipients(members: readonly RecipientInput[]): ResolvedRecipients {
  const seen = new Set<string>();
  const emails: string[] = [];
  const skippedNames: string[] = [];

  for (const member of members) {
    const email = parseEmail(member.memberEmail ?? "") ?? parseEmail(member.accountEmail ?? "");
    if (!email) {
      skippedNames.push(skippedLabel(member));
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return { emails, skippedNoEmail: skippedNames.length, skippedNames };
}
