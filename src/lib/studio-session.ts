import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { STUDIO_COOKIE } from "@/lib/constants";
import { cookieSecret } from "@/lib/env";
import { sessionCookieOptions } from "@/lib/hosting";

export type StudioSessionPayload = {
  studio: true;
};

export async function mintStudioToken(): Promise<string> {
  return new SignJWT({ studio: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(cookieSecret());
}

export async function getStudioSession(): Promise<StudioSessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(STUDIO_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, cookieSecret());
    if (payload.studio !== true) return null;
    return { studio: true };
  } catch {
    return null;
  }
}

export function studioCookieOptions(isProd: boolean) {
  return sessionCookieOptions(isProd);
}
