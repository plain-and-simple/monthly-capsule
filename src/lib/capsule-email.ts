import { groupDisplayName } from "@/lib/copy";

export function capsuleEmailSubject(groupName: string, monthLabel: string): string {
  return `${groupDisplayName(groupName)} — ${monthLabel}`;
}

export function capsuleEmailHtml(input: {
  groupName: string;
  monthLabel: string;
  link: string;
  letters: Array<{ name: string; body: string }>;
  nextOpen: string;
}): string {
  const name = groupDisplayName(input.groupName);
  const count = input.letters.length;
  const letterWord = count === 1 ? "letter" : "letters";
  const letterBlocks = input.letters
    .map((letter) => {
      const body = escapeHtml(letter.body)
        .split(/\n\n+/)
        .map((para) => `<p style="margin:0 0 1rem;font-family:Georgia,serif;font-size:16px;line-height:1.7;color:#24201a">${para.replace(/\n/g, "<br />")}</p>`)
        .join("");
      return `<div style="padding:24px 0;border-bottom:1px solid #e4ddce">
        <p style="margin:0 0 12px;font-family:Georgia,serif;font-size:20px">${escapeHtml(letter.name)}</p>
        ${body || "<p style=\"margin:0;color:#7b7268\">(No letter this month.)</p>"}
      </div>`;
    })
    .join("");

  return `<div style="background:#f5f2ea;color:#1a1712;padding:24px 16px;font-family:ui-sans-serif,system-ui,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fffdf7;border:1px solid #e4ddce;border-radius:14px;padding:32px 24px">
      <p style="margin:0;letter-spacing:0.14em;text-transform:uppercase;font-size:11px;color:#7b7268">${escapeHtml(name)}</p>
      <h1 style="margin:8px 0 8px;font-family:Georgia,serif;font-size:28px;line-height:1.15">${escapeHtml(input.monthLabel)}</h1>
      <p style="margin:0 0 16px;color:#7b7268;font-size:14px">${count} ${letterWord}.</p>
      <p style="margin:0 0 20px"><a href="${escapeAttr(input.link)}" style="color:#24473c">Read the whole capsule</a> · PDF keepsake attached when available.</p>
      ${letterBlocks || `<p style="color:#7b7268">No letters this month.</p>`}
      <p style="margin:24px 0 0;color:#7b7268;font-size:13px;text-align:center">You get this because you are in ${escapeHtml(name)}. Writing opens again on ${escapeHtml(input.nextOpen)}.</p>
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
