import { CapsuleView } from "../view";

export const dynamic = "force-dynamic";

export default async function CapsulePage({
  params,
}: {
  params: Promise<{ uuid: string; yearMonth: string }>;
}) {
  const { uuid, yearMonth } = await params;
  return <CapsuleView uuid={uuid} yearMonth={yearMonth} version={1} />;
}
