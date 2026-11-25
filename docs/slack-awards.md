# Slack awards

Optional per group. One Slack workspace can fill a Slack awards section. The group owner edits the draft before the capsule is compiled.

## Setup

1. Create a Slack app from `docs/slack-app-manifest.yml` (Your Apps, Create New App, From a manifest).
2. Install the app on the workspace.
3. Store the bot token as the Vercel environment variable `SLACK_BOT_TOKEN`. The server reads it only from `process.env.SLACK_BOT_TOKEN` and never logs it.
4. No `/invite` is needed. The bot joins public, non-archived channels itself. Private channels remain out of scope.

The manifest requests only these bot scopes: `channels:read`, `channels:history`, `channels:join`, `reactions:read`, `users:read`. It has no other write scopes and no user scopes.

## When it runs

A Vercel cron calls `GET /api/cron/slack-awards` at `15 6 1 * *` UTC. That is 12:15 AM America/Chicago on the 1st when Central is on standard time, and 1:15 AM when Central is on daylight time. The route requires `Authorization: Bearer $CRON_SECRET`, the same secret as the other crons. A missing or wrong secret returns 401.

For each group with Slack awards on, the job counts messages from the previous calendar month: the 1st at 00:00 through the last day at 23:59:59 America/Chicago. The draft is stored on that month's `year_month`. That key is the calendar month the awards cover. The capsule cycle that shows the month is the next cycle key.

A manual call can set two optional query parameters. Both are checked before Slack is called. A value that fails returns 400, and Slack is not called.

- `year_month` must match `^\d{4}-\d{2}$` and be a real calendar month, for example `2026-03`. The job counts that America/Chicago month, from the 1st at 00:00 through the last day at 23:59:59, and stores that `year_month`. Omit it to keep the previous Chicago month.
- `group_id` must be one uuid, for example `11111111-1111-4111-8111-111111111111`. The job runs only that group. It runs even when Slack awards are off, and it does not turn the setting on. Omit it to run every group with Slack awards on.

The cron write is not forced, so a row the owner has edited is left alone. Owners replace an edited row from group settings with Refresh from Slack. If Slack fails or the token is missing, the failure is logged with the token and Slack ids masked, that group is skipped, and the route still returns 200. The JSON summary lists each group id and a status (`saved`, `skipped`, or `failed`). It has no tokens and no names. Compile and email do not run this job, so a Slack failure cannot block them. Quote text is cut at 200 characters.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/slack-awards?year_month=2026-03&group_id=11111111-1111-4111-8111-111111111111"
```

Owners turn the section on under group settings. They can edit names, counts, and quotes, hide that month, or refresh from Slack. Hiding, disabling, or a missing row leaves the section out of the capsule and the PDF.
