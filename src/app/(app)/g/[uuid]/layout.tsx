import { AppHeader } from "@/components/app-header";
import { readGroupMember } from "@/lib/session";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const loaded = await readGroupMember(uuid);
  if (loaded.status === "retry") return children;

  return (
    <>
      <AppHeader name={loaded.member.preferred_name} showSignOut homeHref="/manage" />
      {children}
    </>
  );
}
