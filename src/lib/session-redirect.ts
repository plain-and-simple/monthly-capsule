import "server-only";
import { NextResponse } from "next/server";
import { ACCOUNT_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { sessionCookieOptions } from "@/lib/hosting";
import { flashErrorPath, SEE_OTHER } from "@/lib/session-policy";
import type { SessionOpenResult } from "@/lib/session-open";
import { mintAccountToken, mintSessionToken } from "@/lib/session";

export type AuthCookieWrite = {
  account?: string;
  session?: string;
  clearAccount?: boolean;
  clearSession?: boolean;
};

export function seeOther(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), SEE_OTHER);
}

export function applyAuthCookies(response: NextResponse, tokens: AuthCookieWrite): NextResponse {
  const opts = sessionCookieOptions(process.env.NODE_ENV === "production");
  if (tokens.account) {
    response.cookies.set(ACCOUNT_COOKIE, tokens.account, opts);
  }
  if (tokens.session) {
    response.cookies.set(SESSION_COOKIE, tokens.session, opts);
  }
  if (tokens.clearAccount) {
    response.cookies.set(ACCOUNT_COOKIE, "", { ...opts, maxAge: 0 });
  }
  if (tokens.clearSession) {
    response.cookies.set(SESSION_COOKIE, "", { ...opts, maxAge: 0 });
  }
  return response;
}

export function seeOtherWithCookies(
  request: Request,
  path: string,
  tokens: AuthCookieWrite,
): NextResponse {
  return applyAuthCookies(seeOther(request, path), tokens);
}

export async function respondSessionOpen(
  request: Request,
  result: SessionOpenResult,
): Promise<NextResponse> {
  if (!result.ok) {
    return seeOther(request, flashErrorPath(result.path, result.error));
  }

  const tokens: AuthCookieWrite = {};
  if (result.account) {
    tokens.account = await mintAccountToken(result.account);
  }
  if (result.session) {
    tokens.session = await mintSessionToken(result.session);
  }
  if (result.clearSession) {
    tokens.clearSession = true;
  }
  return seeOtherWithCookies(request, result.path, tokens);
}
