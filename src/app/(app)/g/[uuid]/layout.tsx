import { AppHeader } from "@/components/app-header";
import { requireGroupMember } from "@/lib/session";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const { member } = await requireGroupMember(uuid);

  return (
    <>
      <AppHeader name={member.preferred_name} showSignOut homeHref="/manage" />
      {children}
    </>
  );
}
