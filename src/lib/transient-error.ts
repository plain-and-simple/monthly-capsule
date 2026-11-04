/** Typed failure for blips (401/PGRST303, 5xx, network). Never treat as "not a member". */
export class TransientError extends Error {
  readonly code: string;
  readonly retry = true as const;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "TransientError";
    this.code = code || "transient";
  }
}

export function isTransientError(error: unknown): error is TransientError {
  if (error instanceof TransientError) return true;
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; retry?: unknown; code?: unknown };
  return value.name === "TransientError" && value.retry === true && typeof value.code === "string";
}

export function mutationCatchKind(error: unknown): "redirect" | "retry" | "fail" {
  if (isNextRedirectDigest(error)) return "redirect";
  if (isTransientError(error)) return "retry";
  return "fail";
}

function isNextRedirectDigest(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
