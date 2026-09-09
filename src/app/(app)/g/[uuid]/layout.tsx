import { SiteHeader } from "@/components/site-header";
import { groupDisplayName } from "@/lib/copy";
import { requireGroupMember } from "@/lib/session";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const { group } = await requireGroupMember(uuid);

  return (
    <>
      <SiteHeader href={`/g/${uuid}`} title={groupDisplayName(group.name)} />
      {children}
    </>
  );
}
