import { parseGroupId } from "@/lib/group-id";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const JOIN_INVITE = new RegExp(`^/join/(${UUID})$`, "i");
const GROUP_HOME = new RegExp(`^/g/(${UUID})$`, "i");
const GROUP_SUBMIT = new RegExp(`^/g/(${UUID})/submit$`, "i");

/** Auth form POST may return to `/` or an allowed next path — never off-site. */
export function parseAuthFormReturn(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = value.trim().split("?")[0].split("#")[0];
  if (raw === "/") return "/";
  return parseReturnPath(raw);
}

/** Auth may return only to join, manage, or create — never off-site. */
export function parseReturnPath(value: string | null | undefined): string | null {
  if (value == null) return null;
  let raw = value.trim();
  if (!raw) return null;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  raw = raw.trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (/[\s]/.test(raw) || raw.includes("://")) return null;

  const path = raw.split("?")[0].split("#")[0];
  if (path === "/join" || path === "/manage" || path === "/create") {
    return path;
  }

  const invite = JOIN_INVITE.exec(path);
  if (invite?.[1]) {
    return `/join/${invite[1].toLowerCase()}`;
  }

  return null;
}

export function inviteJoinPath(groupId: string): string {
  const id = parseGroupId(groupId);
  return id ? `/join/${id}` : "/join";
}

export function parseMembershipNext(
  groupId: string,
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const raw = value.trim().split("?")[0].split("#")[0];
  const home = GROUP_HOME.exec(raw);
  if (home?.[1]?.toLowerCase() === groupId.toLowerCase()) {
    return `/g/${groupId}`;
  }
  const submit = GROUP_SUBMIT.exec(raw);
  if (submit?.[1]?.toLowerCase() === groupId.toLowerCase()) {
    return `/g/${groupId}/submit`;
  }
  return null;
}
