/** A month is ready for email only after both keepsakes exist. */
export function canFinishCompile(input: {
  archiveWritten: boolean;
  pdfStoragePath: string | null | undefined;
}): boolean {
  return input.archiveWritten && typeof input.pdfStoragePath === "string" && input.pdfStoragePath.length > 0;
}

const SAFE_CODE = /^[A-Za-z0-9_]{1,64}$/;

/**
 * Code for logs and ops alerts. Never the raw message: PDF and database
 * errors can echo letter text.
 */
export function opsFailureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && SAFE_CODE.test(code)) return code;
  }
  return "compile_failed";
}

export function codedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}
