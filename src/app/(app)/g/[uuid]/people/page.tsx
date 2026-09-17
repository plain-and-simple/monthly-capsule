import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  redirect(`/g/${uuid}`);
}
