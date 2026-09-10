export const MIN_PASSWORD_LENGTH = 8;

export const LOGIN_WRONG = "Email or password is wrong.";
export const LOGIN_RATE_LIMITED = "Too many tries. Wait a bit.";
export const PASSWORD_TOO_SHORT = "Password needs at least 8 characters.";
export const PREFERRED_NAME_REQUIRED = "Preferred name required.";
export const EMAIL_REQUIRED = "Email required.";
export const EMAIL_INVALID = "Email looks wrong.";
export const ACCOUNT_EXISTS =
  "That email already has an account. Use the same password to link this group, or sign in from Home.";

export const ACCOUNT_FIELDS = ["preferred_name", "email", "password"] as const;
export const FORBIDDEN_ACCOUNT_FIELDS = [
  "phone",
  "sms",
  "phone_number",
  "first_name",
  "last_name",
] as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parsePreferredName(value: string): string | null {
  const name = value.trim();
  if (!name || name.length > 40) return null;
  return name;
}

export function parseEmail(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email || !email.includes("@") || email.length > 254) return null;
  return email;
}

export function passwordError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return PASSWORD_TOO_SHORT;
  }
  return null;
}

export function wantsSaveLogin(value: FormDataEntryValue | null | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").toLowerCase();
  return raw === "1" || raw === "on" || raw === "true";
}

export type ManageDestination =
  | { kind: "empty" }
  | { kind: "one"; groupId: string }
  | { kind: "many" };

export function manageDestination(groupIds: string[]): ManageDestination {
  if (groupIds.length === 0) return { kind: "empty" };
  if (groupIds.length === 1) return { kind: "one", groupId: groupIds[0]! };
  return { kind: "many" };
}

export function managePath(destination: ManageDestination): string {
  if (destination.kind === "one") {
    return `/g/${destination.groupId}`;
  }
  return "/manage";
}

export type JoinIntent =
  | { mode: "session_only"; preferredName: string }
  | { mode: "save_login"; preferredName: string; email: string; password: string };

export function parseJoinIntent(input: {
  preferred_name: string;
  save_login: boolean;
  email: string;
  password: string;
}): JoinIntent | { error: string } {
  const preferredName = parsePreferredName(input.preferred_name);
  if (!preferredName) {
    return { error: PREFERRED_NAME_REQUIRED };
  }
  if (!input.save_login) {
    return { mode: "session_only", preferredName };
  }
  if (!input.email.trim()) {
    return { error: EMAIL_REQUIRED };
  }
  const email = parseEmail(input.email);
  if (!email) {
    return { error: EMAIL_INVALID };
  }
  const pwdError = passwordError(input.password);
  if (pwdError) {
    return { error: pwdError };
  }
  return { mode: "save_login", preferredName, email, password: input.password };
}

export function parseCreateAccount(input: {
  preferred_name: string;
  email: string;
  password: string;
}): { preferredName: string; email: string; password: string } | { error: string } {
  const preferredName = parsePreferredName(input.preferred_name);
  if (!preferredName) {
    return { error: PREFERRED_NAME_REQUIRED };
  }
  if (!input.email.trim()) {
    return { error: EMAIL_REQUIRED };
  }
  const email = parseEmail(input.email);
  if (!email) {
    return { error: EMAIL_INVALID };
  }
  const pwdError = passwordError(input.password);
  if (pwdError) {
    return { error: pwdError };
  }
  return { preferredName, email, password: input.password };
}

export function parseManageLogin(input: {
  email: string;
  password: string;
}): { email: string; password: string } | { error: string } {
  const email = parseEmail(input.email);
  if (!email || !input.password) {
    return { error: LOGIN_WRONG };
  }
  return { email, password: input.password };
}

export function peoplePreferredNames(
  members: Array<{ preferred_name: string; email?: string | null }>,
): Array<{ preferred_name: string }> {
  return members.map(({ preferred_name }) => ({ preferred_name }));
}

export function accountShapeHasForbiddenField(fields: readonly string[]): boolean {
  return fields.some((field) =>
    FORBIDDEN_ACCOUNT_FIELDS.includes(field as (typeof FORBIDDEN_ACCOUNT_FIELDS)[number]),
  );
}

export function membershipListedForAccount(
  member: { account_id: string | null },
  accountId: string,
): boolean {
  return member.account_id === accountId;
}
