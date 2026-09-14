import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { parseGroupId } from "@/lib/group-id";
import { sessionCookieOptions } from "@/lib/hosting";
import { mintSessionToken, requireAccount } from "@/lib/session";
import { decideOpenGroupRequest, SEE_OTHER } from "@/lib/session-policy";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function seeOther(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), SEE_OTHER);
}

async function openGroup(request: Request, groupIdRaw: string): Promise<NextResponse> {
  const groupId = parseGroupId(groupIdRaw);
  const account = await requireAccount();

  let memberId: string | null = null;
  if (groupId) {
    const admin = createAdminClient();
    const { data: member } = await admin
      .from("members")
      .select("id")
      .eq("account_id", account.id)
      .eq("group_id", groupId)
      .maybeSingle();
    memberId = typeof member?.id === "string" ? member.id : null;
  }

  const decision = decideOpenGroupRequest({ groupId, memberId });
  if (decision.action === "redirect_manage") {
    return seeOther(request, decision.path);
  }

  const token = await mintSessionToken({
    memberId: decision.memberId,
    groupId: decision.groupId,
  });
  const response = seeOther(request, decision.path);
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );
  return response;
}

/** POST form from Your groups / Manage: set the group cookie on the response, then 303 GET /g/[uuid]. */
export async function POST(request: Request) {
  const form = await request.formData();
  return openGroup(request, String(form.get("groupId") ?? ""));
}

export async function GET(request: Request) {
  const groupId = new URL(request.url).searchParams.get("groupId") ?? "";
  return openGroup(request, groupId);
}
