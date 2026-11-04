"use client";

import { SubmitForm } from "@/components/submit-form";
import type { SubmitState } from "@/actions/submit";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const YEAR_MONTH = "2026-10";

/** Local smoke only. Does not post letter text. */
async function harnessSaveDraft(_groupId: string, _body: string): Promise<SubmitState> {
  const res = await fetch("/api/e2e-harness/draft-save", { method: "POST" });
  if (res.status === 401 || !res.ok) {
    return { ok: false, retry: true };
  }
  return { ok: true, status: "draft" };
}

export function DraftResilienceHarness() {
  return (
    <SubmitForm
      groupId={GROUP_ID}
      memberId={MEMBER_ID}
      yearMonth={YEAR_MONTH}
      closed={false}
      initialBody=""
      existingPhotos={[]}
      initialStatus={null}
      title="Your letter"
      closesPhrase="the window closes"
      saveDraft={harnessSaveDraft}
    />
  );
}
