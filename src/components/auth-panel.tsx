"use client";

import { ManageForm } from "@/components/manage-form";
import { SignUpForm } from "@/components/sign-up-form";

export function AuthPanel({
  next,
  error,
  returnTo = "/",
}: {
  next?: string | null;
  error?: string | null;
  returnTo?: string;
}) {
  return (
    <div className="auth-split">
      <div className="card card--pad-lg">
        <ManageForm next={next} error={error} returnTo={returnTo} />
      </div>
      <div className="card card--pad-lg">
        <SignUpForm next={next} returnTo={returnTo} />
      </div>
    </div>
  );
}
