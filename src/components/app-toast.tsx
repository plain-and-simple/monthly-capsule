"use client";

import { useCallback, useEffect, useState } from "react";
import { TOAST_DISMISS, TOAST_SUCCESS } from "@/lib/copy";
import { TOAST_DISMISS_MS, type ToastTone } from "@/lib/toast";

export function AppToast({
  open,
  title = TOAST_SUCCESS,
  message,
  tone = "success",
  onDismiss,
}: {
  open: boolean;
  title?: string;
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onDismiss, TOAST_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [open, message, onDismiss]);

  if (!open || !message) return null;

  return (
    <div
      className={tone === "danger" ? "toast toast--danger" : "toast"}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="toast__body">
        <p className="toast__title">{title}</p>
        <p className="toast__message">{message}</p>
      </div>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label={TOAST_DISMISS}>
        ×
      </button>
    </div>
  );
}

export function MutationToast({
  pending,
  ok,
  message,
}: {
  pending: boolean;
  ok?: boolean;
  message?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const onDismiss = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (pending) {
      setOpen(false);
      return;
    }
    if (!ok || !message) return;
    setText(message);
    setOpen(true);
  }, [pending, ok, message]);

  return <AppToast open={open} message={text} onDismiss={onDismiss} />;
}

export function FlashToast({ message }: { message: string }) {
  const [open, setOpen] = useState(true);
  const onDismiss = useCallback(() => setOpen(false), []);
  return <AppToast open={open} message={message} onDismiss={onDismiss} />;
}
