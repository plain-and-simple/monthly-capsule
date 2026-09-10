import { notFound } from "next/navigation";
import { parseCapsuleEditionParam } from "@/lib/month-version";
import { CapsuleView } from "../../view";

export const dynamic = "force-dynamic";

export default async function CapsuleEditionPage({
  params,
}: {
  params: Promise<{ uuid: string; yearMonth: string; edition: string }>;
}) {
  const { uuid, yearMonth, edition } = await params;
  const version = parseCapsuleEditionParam(edition);
  if (version == null) notFound();
  return <CapsuleView uuid={uuid} yearMonth={yearMonth} version={version} />;
}
