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
  created_at: string;
};

export type Account = {
  id: string;
  preferred_name: string;
  email: string;
  password_hash: string;
  created_at: string;
};

export type Member = {
  id: string;
  group_id: string;
  preferred_name: string;
  email: string | null;
  role: Role;
  account_id: string | null;
  joined_at: string;
};

export type AccountSessionPayload = {
  accountId: string;
};

export type Month = {
  id: string;
  group_id: string;
  year_month: string;
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
};

export type SessionPayload = {
  memberId: string;
  groupId: string;
};
