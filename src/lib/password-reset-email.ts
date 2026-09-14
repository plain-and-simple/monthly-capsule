import { PRODUCT_NAME } from "@/lib/copy";

export function passwordResetEmailSubject(): string {
  return `Reset your ${PRODUCT_NAME} password`;
}

export function passwordResetEmailHtml(input: {
  preferredName: string;
  link: string;
}): string {
  const greeting = input.preferredName.trim() || "there";
  return `<div style="background:#f5f2ea;color:#1a1712;padding:24px 16px;font-family:ui-sans-serif,system-ui,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fffdf7;border:1px solid #e4ddce;border-radius:14px;padding:32px 24px">
      <p style="margin:0;letter-spacing:0.14em;text-transform:uppercase;font-size:11px;color:#7b7268">${escapeHtml(PRODUCT_NAME)}</p>
      <h1 style="margin:8px 0 12px;font-family:Georgia,serif;font-size:28px;line-height:1.15">Reset your password</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6">Hi ${escapeHtml(greeting)}, someone asked to reset the password for this ${escapeHtml(PRODUCT_NAME)} account.</p>
      <p style="margin:0 0 20px"><a href="${escapeAttr(input.link)}" style="color:#24473c">Choose a new password</a></p>
      <p style="margin:0;color:#7b7268;font-size:13px">This link works once and expires in an hour. If you did not ask, you can ignore this.</p>
    </div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
