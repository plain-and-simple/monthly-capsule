"use client";

import { useState } from "react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { COPY_FAILED } from "@/lib/copy";

export function CopyButton({
  text,
  label,
  className = "btn btn--secondary",
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const ok = await copyTextToClipboard(text);
    setCopied(ok);
    setFailed(!ok);
    window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1500);
  }

  return (
    <button type="button" className={className} onClick={() => void copy()}>
      {failed ? COPY_FAILED : copied ? "Copied" : label}
    </button>
  );
}
