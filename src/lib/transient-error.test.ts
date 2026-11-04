import { describe, expect, it } from "vitest";
import { isTransientError, mutationCatchKind, TransientError } from "./transient-error";

describe("TransientError", () => {
  it("is retryable and never classified as a redirect", () => {
    const error = new TransientError("PGRST303", "JWT claims validation failed");
    expect(error.retry).toBe(true);
    expect(isTransientError(error)).toBe(true);
    expect(mutationCatchKind(error)).toBe("retry");
    expect(mutationCatchKind({ digest: "NEXT_REDIRECT;replace;/manage;303;" })).toBe("redirect");
    expect(mutationCatchKind(new Error("Could not save."))).toBe("fail");
  });
});
