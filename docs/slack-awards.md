# Slack awards

Optional per group. One Slack workspace can fill a Slack awards section. The group owner edits the draft before the capsule is compiled.

## Setup

1. Create a Slack app from `docs/slack-app-manifest.yml` (Your Apps, Create New App, From a manifest).
2. Install the app on the workspace.
3. Store the bot token as the Vercel environment variable `SLACK_BOT_TOKEN`. The server reads it only from `process.env.SLACK_BOT_TOKEN` and never logs it.
4. No `/invite` is needed. The bot joins public, non-archived channels itself. Private channels remain out of scope.

The manifest requests only these bot scopes: `channels:read`, `channels:history`, `channels:join`, `reactions:read`, `users:read`. It has no other write scopes and no user scopes.

## When it runs

The compile cron and the email cron (not a dry run) build the draft on the America/Chicago day before the group's submit close. Messages are counted for the writing month, the calendar month before the capsule cycle, from the start of that month through the moment the next month starts.

The draft is stored on the capsule cycle key. A row the owner has edited is left alone unless they confirm a refresh. If Slack fails or the token is missing, the failure is logged with the token and Slack ids masked, and the section is skipped. Compile and email still run.

Owners turn the section on under group settings. They can edit names, counts, and quotes, hide that month, or refresh from Slack. Hiding, disabling, or a missing row leaves the section out of the capsule and the PDF.
