"use client";

import { logoutAccount } from "@/actions/logout";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SIGN_OUT } from "@/lib/copy";

export function SignOutButton() {
  return (
    <form action={logoutAccount}>
      <PendingSubmitButton className="signout" pendingLabel="Signing out…">
        {SIGN_OUT}
      </PendingSubmitButton>
    </form>
  );
}
