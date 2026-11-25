"use client";

import { useActionState } from "react";
import {
  refreshSlackAwards,
  saveSlackAwardsDraft,
  updateSlackAwardsEnabled,
  type SlackAwardsState,
} from "@/actions/slack-awards";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import {
  SLACK_AWARDS_BRONZE,
  SLACK_AWARDS_CHANNEL,
  SLACK_AWARDS_GOLD,
  SLACK_AWARDS_HIDE,
  SLACK_AWARDS_HINT,
  SLACK_AWARDS_REACTIONS,
  SLACK_AWARDS_REFRESH,
  SLACK_AWARDS_REPLIES,
  SLACK_AWARDS_REPLACE,
  SLACK_AWARDS_SAVE,
  SLACK_AWARDS_SECTION,
  SLACK_AWARDS_SILVER,
  SLACK_AWARDS_TOGGLE,
} from "@/lib/copy";
import type { SlackAwardsData } from "@/lib/slack-awards";

const PLACES = [
  ["gold", SLACK_AWARDS_GOLD],
  ["silver", SLACK_AWARDS_SILVER],
  ["bronze", SLACK_AWARDS_BRONZE],
] as const;

export function SlackAwardsForm({
  groupId,
  yearMonth,
  monthLabel,
  enabled,
  ownerEdited,
  hidden,
  awards,
}: {
  groupId: string;
  yearMonth: string;
  monthLabel: string;
  enabled: boolean;
  ownerEdited: boolean;
  hidden: boolean;
  awards: SlackAwardsData;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState<SlackAwardsState, FormData>(
    updateSlackAwardsEnabled,
    null,
  );
  const { busy: toggleBusy, markBusy: markToggleBusy } = useInstantBusy(togglePending);
  const [draftState, draftAction, draftPending] = useActionState<SlackAwardsState, FormData>(
    saveSlackAwardsDraft,
    null,
  );
  const { busy: draftBusy, markBusy: markDraftBusy } = useInstantBusy(draftPending);
  const [refreshState, refreshAction, refreshPending] = useActionState<SlackAwardsState, FormData>(
    refreshSlackAwards,
    null,
  );
  const { busy: refreshBusy, markBusy: markRefreshBusy } = useInstantBusy(refreshPending);
  const sender = (place: (typeof PLACES)[number][0]) => awards.senders.find((row) => row.place === place);

  return (
    <section className="stack">
      <h2>{SLACK_AWARDS_SECTION}</h2>
      <p className="formnote">{SLACK_AWARDS_HINT}</p>
      <form action={toggleAction} className="stack" onSubmit={markToggleBusy} aria-busy={toggleBusy || undefined}>
        <input type="hidden" name="groupId" value={groupId} />
        <label className="check">
          <input type="checkbox" name="slack_awards_enabled" value="1" defaultChecked={enabled} />
          <span>{SLACK_AWARDS_TOGGLE}</span>
        </label>
        {toggleState?.error ? <p className="err">{toggleState.error}</p> : null}
        {toggleState?.ok ? <p className="small">Saved.</p> : null}
        <div>
          <PendingSubmitButton className="btn btn--secondary" busy={toggleBusy} pendingLabel="Saving…">
            Save
          </PendingSubmitButton>
        </div>
      </form>

      {enabled ? (
        <>
          <form action={draftAction} className="stack" onSubmit={markDraftBusy} aria-busy={draftBusy || undefined}>
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="year_month" value={yearMonth} />
            <p className="small muted">{monthLabel}</p>
            {PLACES.map(([place, label]) => {
              const row = sender(place);
              return (
                <div className="field-inline" key={place}>
                  <label className="field">
                    <span className="field__label">{label}</span>
                    <input className="input" name={`sender_${place}_name`} maxLength={80} defaultValue={row?.name ?? ""} />
                  </label>
                  <label className="field">
                    <span className="field__label">Count</span>
                    <input
                      className="input"
                      name={`sender_${place}_count`}
                      inputMode="numeric"
                      maxLength={6}
                      defaultValue={row ? String(row.count) : ""}
                    />
                  </label>
                </div>
              );
            })}
            <div className="field-inline">
              <label className="field">
                <span className="field__label">{SLACK_AWARDS_CHANNEL}</span>
                <input
                  className="input"
                  name="channel_name"
                  maxLength={80}
                  defaultValue={awards.channel?.name ?? ""}
                />
              </label>
              <label className="field">
                <span className="field__label">Count</span>
                <input
                  className="input"
                  name="channel_count"
                  inputMode="numeric"
                  maxLength={6}
                  defaultValue={awards.channel ? String(awards.channel.count) : ""}
                />
              </label>
            </div>
            <QuoteFields
              legend={SLACK_AWARDS_REPLIES}
              prefix="replies"
              name={awards.mostReplies?.name ?? ""}
              channel={awards.mostReplies?.channel ?? ""}
              count={awards.mostReplies ? String(awards.mostReplies.replyCount) : ""}
              text={awards.mostReplies?.text ?? ""}
              countName="replies_count"
            />
            <QuoteFields
              legend={SLACK_AWARDS_REACTIONS}
              prefix="reactions"
              name={awards.mostReactions?.name ?? ""}
              channel={awards.mostReactions?.channel ?? ""}
              count={awards.mostReactions ? String(awards.mostReactions.reactionTotal) : ""}
              text={awards.mostReactions?.text ?? ""}
              emoji={awards.mostReactions?.topEmoji ?? ""}
              countName="reactions_total"
            />
            <label className="check">
              <input type="checkbox" name="hidden" value="1" defaultChecked={hidden} />
              <span>{SLACK_AWARDS_HIDE}</span>
            </label>
            {draftState?.error ? <p className="err">{draftState.error}</p> : null}
            {draftState?.ok ? <p className="small">Saved.</p> : null}
            <div>
              <PendingSubmitButton className="btn btn--secondary" busy={draftBusy} pendingLabel="Saving…">
                {SLACK_AWARDS_SAVE}
              </PendingSubmitButton>
            </div>
          </form>

          <form
            action={refreshAction}
            className="stack"
            onSubmit={markRefreshBusy}
            aria-busy={refreshBusy || undefined}
          >
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="year_month" value={yearMonth} />
            {ownerEdited ? (
              <label className="check">
                <input type="checkbox" name="confirm_replace" value="1" />
                <span>{SLACK_AWARDS_REPLACE}</span>
              </label>
            ) : null}
            {refreshState?.error ? <p className="err">{refreshState.error}</p> : null}
            {refreshState?.notice ? <p className="small">{refreshState.notice}</p> : null}
            <div>
              <PendingSubmitButton className="btn btn--secondary" busy={refreshBusy} pendingLabel="Refreshing…">
                {SLACK_AWARDS_REFRESH}
              </PendingSubmitButton>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}

function QuoteFields({
  legend,
  prefix,
  name,
  channel,
  count,
  text,
  emoji,
  countName,
}: {
  legend: string;
  prefix: "replies" | "reactions";
  name: string;
  channel: string;
  count: string;
  text: string;
  emoji?: string;
  countName: string;
}) {
  return (
    <fieldset className="stack">
      <legend className="field__label">{legend}</legend>
      <div className="field-inline">
        <label className="field">
          <span className="field__label">Name</span>
          <input className="input" name={`${prefix}_name`} maxLength={80} defaultValue={name} />
        </label>
        <label className="field">
          <span className="field__label">Channel</span>
          <input className="input" name={`${prefix}_channel`} maxLength={80} defaultValue={channel} />
        </label>
        <label className="field">
          <span className="field__label">Count</span>
          <input className="input" name={countName} inputMode="numeric" maxLength={6} defaultValue={count} />
        </label>
      </div>
      {emoji !== undefined ? (
        <label className="field">
          <span className="field__label">Top emoji</span>
          <input className="input" name="reactions_emoji" maxLength={64} defaultValue={emoji} />
        </label>
      ) : null}
      <label className="field">
        <span className="field__label">Quote</span>
        <textarea className="textarea" name={`${prefix}_text`} maxLength={200} rows={3} defaultValue={text} />
      </label>
    </fieldset>
  );
}
