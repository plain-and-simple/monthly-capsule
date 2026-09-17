"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { ACCOUNT_PASSWORD_LABEL, HIDE_PASSWORD, SHOW_PASSWORD } from "@/lib/copy";
import {
  FIELD_IDLE_MS,
  PASSWORD_HINT,
  emailFieldError,
  passwordFieldError,
} from "@/lib/field-validation";

function useIdleError(value: string, validate: (next: string) => string | null) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setError(validate(value)), FIELD_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [value, validate]);

  return {
    error,
    onBlur: (next: string) => setError(validate(next)),
    onValue: (next: string) => {
      setError(null);
      return next;
    },
  };
}

type AuthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name" | "value"> & {
  name?: string;
};

export function EmailInput({ name = "email", defaultValue, ...props }: AuthInputProps) {
  const [value, setValue] = useState(String(defaultValue ?? ""));
  const { error, onBlur, onValue } = useIdleError(value, emailFieldError);

  return (
    <label className="field">
      <span className="field__label">Email</span>
      <input
        {...props}
        className={props.className ?? "input"}
        name={name}
        type="email"
        required={props.required ?? true}
        autoComplete={props.autoComplete ?? "email"}
        placeholder={props.placeholder ?? "you@example.com"}
        defaultValue={defaultValue}
        onChange={(event) => setValue(onValue(event.target.value))}
        onBlur={(event) => {
          const next = event.target.value;
          setValue(next);
          onBlur(next);
        }}
      />
      {error ? <span className="err">{error}</span> : null}
    </label>
  );
}

export function PasswordInput({
  autoComplete,
  name = "password",
  defaultValue,
  ...props
}: AuthInputProps) {
  const [value, setValue] = useState(String(defaultValue ?? ""));
  const [visible, setVisible] = useState(false);
  const { error, onBlur, onValue } = useIdleError(value, passwordFieldError);

  return (
    <label className="field">
      <span className="field__label">{ACCOUNT_PASSWORD_LABEL}</span>
      <span className="field__control">
        <input
          {...props}
          className={props.className ?? "input"}
          name={name}
          type={visible ? "text" : "password"}
          required={props.required ?? true}
          minLength={8}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          onChange={(event) => setValue(onValue(event.target.value))}
          onBlur={(event) => {
            const next = event.target.value;
            setValue(next);
            onBlur(next);
          }}
        />
        <button
          type="button"
          className="field__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
        >
          {visible ? HIDE_PASSWORD : SHOW_PASSWORD}
        </button>
      </span>
      <span className="field__hint">{PASSWORD_HINT}</span>
      {error ? <span className="err">{error}</span> : null}
    </label>
  );
}
