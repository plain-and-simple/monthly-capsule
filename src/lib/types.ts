import type { CapsuleTheme } from "@/lib/capsule-theme";

export type Role = "owner" | "member";
export type MonthStatus = "open" | "closed" | "compiled";
export type SubmitStatus = "draft" | "submitted";

export type Group = {
  id: string;
  name: string;
  pin_hash: string;
  submit_start_day: number;
  submit_end_day: number;
  email_day: number;
  force_open_year_month: string | null;
  capsule_theme: CapsuleTheme;
  /** Absent on rows read before the Slack awards migration. Treat as off. */
  slack_awards_enabled?: boolean;
  created_at: string;
};

export type Account = {
  id: string;
  preferred_name: string;
  email: string;
  password_hash: string;
  banned_at: string | null;
  created_at: string;
  /** Missing on rows read before the session_version migration. Treat as 0. */
  session_version?: number | null;
};

export type Member = {
  id: string;
  group_id: string;
  preferred_name: string;
  email: string | null;
  role: Role;
  account_id: string | null;
  joined_at: string;
  removed_at: string | null;
};

export type AccountSessionPayload = {
  accountId: string;
  /** Null when the cookie was minted before session versions existed. */
  sessionVersion: number | null;
};

export type Month = {
  id: string;
  group_id: string;
  year_month: string;
  version: number;
  status: MonthStatus;
  created_at: string;
};

export type Submission = {
  id: string;
  month_id: string;
  member_id: string;
  body: string;
  status: SubmitStatus;
  submitted_at: string;
  updated_at: string;
};

export type Photo = {
  id: string;
  submission_id: string;
  storage_path: string;
  width: number;
  height: number;
  bytes: number;
  sort_order: number;
};

export type Capsule = {
  id: string;
  month_id: string;
  compiled_at: string;
  email_sent_at: string | null;
  email_held: boolean;
  archive?: unknown;
  pdf_storage_path?: string | null;
};

export type SessionPayload = {
  memberId: string;
  groupId: string;
  /** Null when the cookie was minted before session versions existed. */
  sessionVersion: number | null;
};

export type CycleEmailSend = {
  id: string;
  group_id: string;
  year_month: string;
  member_id: string;
  open_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
};
