export type CapsuleEmailFlags = {
  email_sent_at: string | null;
  email_held: boolean;
};

/** Cron email_day: send only when unused force-skip and not yet sent. */
export function cronShouldSendCapsule(capsule: CapsuleEmailFlags): boolean {
  return !capsule.email_sent_at && !capsule.email_held;
}

export function ownerCanEmailCapsule(capsule: Pick<CapsuleEmailFlags, "email_sent_at">): boolean {
  return !capsule.email_sent_at;
}

export function holdEmailUpdate(): { email_held: true } {
  return { email_held: true };
}

export function sentEmailUpdate(at: string): { email_sent_at: string; email_held: false } {
  return { email_sent_at: at, email_held: false };
}
