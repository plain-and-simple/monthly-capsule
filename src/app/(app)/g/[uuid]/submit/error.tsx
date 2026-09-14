"use client";

import { useEffect } from "react";

export default function SubmitError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("submit page error", error);
  }, [error]);

  return (
    <main className="main">
      <div className="wrap">
        <div className="stack">
          <h1>Something went wrong</h1>
          <p className="muted">Try again in a moment.</p>
          <button className="btn btn--primary" type="button" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
