"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { checkStudioCode, createGroup, type CreateState } from "@/actions/create-group";
import { CopyButton } from "@/components/copy-button";
import { CreateSteps } from "@/components/create-steps";
import {
  ACCOUNT_PASSWORD_LABEL,
  PREFERRED_NAME_LABEL,
  createSuccessHero,
  groupDisplayName,
} from "@/lib/copy";
import {
  DEFAULT_EMAIL_DAY,
  DEFAULT_SUBMIT_END_DAY,
  DEFAULT_SUBMIT_START_DAY,
} from "@/lib/constants";
import { STUDIO_CODE_ERROR } from "@/lib/studio-code";

function DaySelect({
  id,
  name,
  defaultValue,
  label,
}: {
  id: string;
  name: string;
  defaultValue: number;
  label: string;
}) {
  return (
    <select id={id} name={name} className="select" aria-label={label} defaultValue={defaultValue}>
      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
        <option key={day} value={day}>
          {day}
        </option>
      ))}
    </select>
  );
}

export function CreateForm({ signedInAs }: { signedInAs?: string | null }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createGroup, null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [studioCode, setStudioCode] = useState("");
  const [studioError, setStudioError] = useState<string | null>(null);
  const [checkingCode, startCheck] = useTransition();
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (state?.ok) {
    const hero = createSuccessHero({ name: state.groupName, pin: state.pin });
    const groupName = groupDisplayName(state.groupName);
    const combined = `Join ${groupName} on Plain and Simple Monthly Capsule.\n\nLink: ${state.shareUrl}\nGroup PIN: ${state.pin}`;
    return (
      <div className="wrap">
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <p className="eyebrow">{groupName} is ready</p>
            <h1>Write this down now</h1>
            <p className="lede">
              The PIN is shown this one time. We keep a scrambled copy, so we cannot read it back to
              you later — only make a new one.
            </p>
          </div>
          <div className="card">
            <div className="stack">
              <div className="stack stack--tight">
                <span className="field__label">Invite link</span>
                <div className="copyrow">
                  <input className="input" readOnly value={state.shareUrl} />
                  <CopyButton text={state.shareUrl} label={hero.copyLabel} />
                </div>
              </div>
              <div className="stack stack--tight">
                <span className="field__label">Group PIN</span>
                <div className="pinbox">
                  <span className="pin">{hero.pin}</span>
                  <CopyButton text={hero.pin} label={hero.copyLabel} className="btn btn--quiet" />
                </div>
              </div>
              <CopyButton
                text={combined}
                label="Copy link and PIN together"
                className="btn btn--primary btn--block"
              />
              <p className="btn-note">Send them in the same message. Both are needed to join.</p>
            </div>
          </div>
          <div className="panel">
            <p className="small muted">
              Lost the PIN? Settings has <b>Make a new PIN</b>. The old one stops working straight
              away, and anyone already in the group stays in.
            </p>
          </div>
          <Link className="btn btn--secondary btn--block" href={`/g/${state.groupId}`}>
            I have saved these — go to {groupName}
          </Link>
          <p className="tiny muted">{hero.hint}</p>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="wrap wrap--narrow">
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <Link className="backlink" href="/">
              ← Back
            </Link>
            <CreateSteps current={1} />
          </div>
          <div className="card card--pad-lg">
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                const next = String(new FormData(event.currentTarget).get("studio_code") ?? "").trim();
                if (!next) return;
                setStudioError(null);
                startCheck(async () => {
                  const result = await checkStudioCode(next);
                  if (!result.ok) {
                    setStudioError(result.error || STUDIO_CODE_ERROR);
                    return;
                  }
                  setStudioCode(next);
                  setStep(signedInAs ? 3 : 2);
                });
              }}
            >
              <div className="stack stack--tight">
                <h1>Studio code</h1>
                <p className="muted small">New groups are made by invitation from the studio.</p>
              </div>
              <label className="field">
                <span className="field__label">Code</span>
                <input
                  className="input input--code"
                  name="studio_code"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={studioCode}
                />
                <span className="field__hint">Case does not matter.</span>
              </label>
              {studioError ? <p className="err">{studioError}</p> : null}
              <button className="btn btn--primary btn--block" type="submit" disabled={checkingCode}>
                {checkingCode ? "Checking…" : "Continue"}
              </button>
            </form>
          </div>
          <p className="center small muted">
            Already have an account? <Link href="/">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  if (step === 2 && !signedInAs) {
    return (
      <div className="wrap wrap--narrow">
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <button className="backlink" type="button" onClick={() => setStep(1)}>
              ← Back
            </button>
            <CreateSteps current={2} />
          </div>
          <div className="card card--pad-lg">
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (!event.currentTarget.reportValidity()) return;
                const data = new FormData(event.currentTarget);
                setPreferredName(String(data.get("preferred_name") ?? ""));
                setEmail(String(data.get("email") ?? ""));
                setPassword(String(data.get("password") ?? ""));
                setStep(3);
              }}
            >
              <div className="stack stack--tight">
                <h1>Your account</h1>
                <p className="muted small">One account, as many groups as you like.</p>
              </div>
              <div>
                <label className="field">
                  <span className="field__label">{PREFERRED_NAME_LABEL}</span>
                  <input
                    className="input"
                    name="preferred_name"
                    maxLength={40}
                    required
                    autoComplete="nickname"
                    defaultValue={preferredName}
                  />
                  <span className="field__hint">What your group sees above your letters.</span>
                </label>
                <label className="field">
                  <span className="field__label">Email</span>
                  <input
                    className="input"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={email}
                  />
                  <span className="field__hint">Where capsules arrive. Never shown to the group.</span>
                </label>
                <label className="field">
                  <span className="field__label">{ACCOUNT_PASSWORD_LABEL}</span>
                  <input
                    className="input"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    defaultValue={password}
                  />
                  <span className="field__hint">At least 8 characters.</span>
                </label>
              </div>
              <button className="btn btn--primary btn--block" type="submit">
                Continue
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap wrap--narrow">
      <div className="stack stack--loose">
        <div className="stack stack--tight">
          <button className="backlink" type="button" onClick={() => setStep(signedInAs ? 1 : 2)}>
            ← Back
          </button>
          <CreateSteps current={3} />
        </div>
        <div className="card card--pad-lg">
          <form action={action} className="stack">
            <div className="stack stack--tight">
              <h1>Name the group</h1>
              <p className="muted small">
                {signedInAs
                  ? `Creating as ${signedInAs}. You can change the cycle later in Settings.`
                  : "You can change all of this later in Settings."}
              </p>
            </div>
            <input type="hidden" name="studio_code" value={studioCode} />
            {!signedInAs ? (
              <>
                <input type="hidden" name="preferred_name" value={preferredName} />
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="password" value={password} />
              </>
            ) : null}
            <label className="field">
              <span className="field__label">Group name</span>
              <input className="input" name="name" maxLength={40} placeholder="Optional" />
              <span className="field__hint">What everyone sees. Keep it short.</span>
            </label>
            <div className="field">
              <span className="field__label">Monthly cycle</span>
              <div className="stack stack--tight">
                <div className="field-inline">
                  <span className="small muted">Submit opens</span>
                  <DaySelect
                    id="submit_start_day"
                    name="submit_start_day"
                    defaultValue={DEFAULT_SUBMIT_START_DAY}
                    label="Submit opens"
                  />
                </div>
                <div className="field-inline">
                  <span className="small muted">Submit closes</span>
                  <DaySelect
                    id="submit_end_day"
                    name="submit_end_day"
                    defaultValue={DEFAULT_SUBMIT_END_DAY}
                    label="Submit closes"
                  />
                </div>
                <div className="field-inline">
                  <span className="small muted">Email capsule</span>
                  <DaySelect
                    id="email_day"
                    name="email_day"
                    defaultValue={DEFAULT_EMAIL_DAY}
                    label="Email capsule"
                  />
                </div>
              </div>
              <span className="field__hint">Days of the month. America/Chicago.</span>
            </div>
            {state && !state.ok ? <p className="err">{state.error}</p> : null}
            <button className="btn btn--primary btn--block" type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create group"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
