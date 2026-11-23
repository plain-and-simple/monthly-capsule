"use client";

import {
  GROUP_LOAD_RETRY_BUTTON,
  GROUP_LOAD_RETRY_HEADING,
  GROUP_LOAD_RETRY_HINT,
} from "@/lib/copy";

export function GroupLoadRetry() {
  return (
    <main className="main">
      <div className="wrap">
        <div className="stack">
          <h1>{GROUP_LOAD_RETRY_HEADING}</h1>
          <p className="muted">{GROUP_LOAD_RETRY_HINT}</p>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            {GROUP_LOAD_RETRY_BUTTON}
          </button>
        </div>
      </div>
    </main>
  );
}
