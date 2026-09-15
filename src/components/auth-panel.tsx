"use client";

import { useState } from "react";
import { ManageForm } from "@/components/manage-form";
import { SignUpForm } from "@/components/sign-up-form";
import { LANDING_HAVE_LOGIN, LANDING_NEED_ACCOUNT, LANDING_SIGN_IN, LANDING_SIGN_UP } from "@/lib/copy";

export function AuthPanel({
  next,
  error,
  returnTo = "/",
  defaultMode = "signup",
}: {
  next?: string | null;
  error?: string | null;
  returnTo?: string;
  defaultMode?: "signup" | "signin";
}) {
  const [mode, setMode] = useState<"signup" | "signin">(defaultMode);

  return (
    <div className="stack">
      {mode === "signup" ? (
        <SignUpForm next={next} error={error} returnTo={returnTo} />
      ) : (
        <ManageForm next={next} error={error} returnTo={returnTo} />
      )}
      {mode === "signup" ? (
        <p className="center small muted">
          {LANDING_HAVE_LOGIN}{" "}
          <button type="button" className="textlink" onClick={() => setMode("signin")}>
            {LANDING_SIGN_IN}
          </button>
        </p>
      ) : (
        <p className="center small muted">
          {LANDING_NEED_ACCOUNT}{" "}
          <button type="button" className="textlink" onClick={() => setMode("signup")}>
            {LANDING_SIGN_UP}
          </button>
        </p>
      )}
    </div>
  );
}
