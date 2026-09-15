"use client";

import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SIGN_OUT } from "@/lib/copy";
import { LOGOUT_PATH } from "@/lib/session-policy";

export function SignOutButton() {
  return (
    <form action={LOGOUT_PATH} method="post">
      <PendingSubmitButton className="signout" pendingLabel="Signing out…">
        {SIGN_OUT}
      </PendingSubmitButton>
    </form>
  );
}
