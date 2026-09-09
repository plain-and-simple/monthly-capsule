import { redirect } from "next/navigation";
import { JoinForm } from "@/components/join-form";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const session = await getSession();
  if (session?.groupId === uuid) {
    redirect(`/g/${uuid}`);
  }
  return <JoinForm uuid={uuid} />;
}
