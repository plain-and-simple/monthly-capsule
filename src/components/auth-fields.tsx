"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { ACCOUNT_PASSWORD_LABEL } from "@/lib/copy";
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
    onBlur: () => setError(validate(value)),
    onValue: (next: string) => {
      setError(null);
      return next;
    },
  };
}

export function EmailInput({
  name = "email",
  defaultValue,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name"> & { name?: string }) {
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
        value={value}
        onChange={(event) => setValue(onValue(event.target.value))}
        onBlur={onBlur}
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
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name"> & { name?: string }) {
  const [value, setValue] = useState(String(defaultValue ?? ""));
  const { error, onBlur, onValue } = useIdleError(value, passwordFieldError);

  return (
    <label className="field">
      <span className="field__label">{ACCOUNT_PASSWORD_LABEL}</span>
      <input
        {...props}
        className={props.className ?? "input"}
        name={name}
        type="password"
        required={props.required ?? true}
        minLength={8}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => setValue(onValue(event.target.value))}
        onBlur={onBlur}
      />
      <span className="field__hint">{PASSWORD_HINT}</span>
      {error ? <span className="err">{error}</span> : null}
    </label>
  );
}
