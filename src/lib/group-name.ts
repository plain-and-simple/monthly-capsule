export const GROUP_NAME_REQUIRED = "Group name required.";
export const GROUP_NAME_TOO_LONG = "Name is too long.";
export const GROUP_NAME_MAX_LENGTH = 40;

/** Trimmed group name, or a short error. Blank and whitespace are rejected. */
export function parseGroupName(value: string): string | { error: string } {
  const name = value.trim();
  if (!name) return { error: GROUP_NAME_REQUIRED };
  if (name.length > GROUP_NAME_MAX_LENGTH) return { error: GROUP_NAME_TOO_LONG };
  return name;
}

export function isGroupNameError(message: string): boolean {
  return message === GROUP_NAME_REQUIRED || message === GROUP_NAME_TOO_LONG;
}
