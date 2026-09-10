import "server-only";
import { DEFAULT_RESEND_FROM } from "@/lib/email-policy";
import { resolveCreateGroupCode } from "@/lib/studio-code";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

export function cookieSecret(): Uint8Array {
  const secret = required("COOKIE_SECRET");
  if (secret.length < 16) {
    throw new Error("COOKIE_SECRET must be at least 16 characters");
  }
  return new TextEncoder().encode(secret);
}

export function cronSecret(): string {
  return required("CRON_SECRET");
}

export function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY || null;
}

export function resendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM;
}

export function createGroupCode(): string {
  return resolveCreateGroupCode(process.env.CREATE_GROUP_CODE);
}
