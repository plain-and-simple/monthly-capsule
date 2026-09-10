"use client";

import { useState } from "react";

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

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={className} onClick={() => void copy()}>
      {copied ? "Copied" : label}
    </button>
  );
}
