import "server-only";
import { ensureCapsuleArchive, findMonthEdition } from "@/lib/compile";
import { ensureCapsulePdf } from "@/lib/capsule-pdf-store";
import { PDF_CONTENT_TYPE } from "@/lib/capsule-pdf";
import { parseCapsuleArchive } from "@/lib/capsule-archive";
import { DEFAULT_MONTH_VERSION } from "@/lib/month-version";
import { requireGroupMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase";

export async function capsulePdfResponse(input: {
  uuid: string;
  yearMonth: string;
  version?: number;
}): Promise<Response> {
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    return new Response("Not found", { status: 404 });
  }

  const version = input.version ?? DEFAULT_MONTH_VERSION;
  const { group } = await requireGroupMember(input.uuid);
  const month = await findMonthEdition(input.uuid, input.yearMonth, version);
  if (!month) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: capsule } = await admin.from("capsules").select("*").eq("month_id", month.id).maybeSingle();
  if (!capsule) return new Response("Not ready", { status: 404 });

  const archive =
    parseCapsuleArchive(capsule.archive) ??
    (await ensureCapsuleArchive(group, input.yearMonth, month.id, capsule, month.version));

  const pdf = await ensureCapsulePdf({
    capsuleId: capsule.id as string,
    groupId: group.id,
    groupName: group.name,
    yearMonth: input.yearMonth,
    version: month.version,
    archive,
    pdfStoragePath: (capsule.pdf_storage_path as string | null | undefined) ?? null,
  });

  if (!pdf) {
    return new Response("PDF is not ready", { status: 503 });
  }

  return new Response(Buffer.from(pdf.bytes), {
    status: 200,
    headers: {
      "Content-Type": PDF_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${pdf.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
