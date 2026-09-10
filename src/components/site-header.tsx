import { AppHeader } from "@/components/app-header";

export function SiteHeader({
  href = "/",
  name,
  showSignOut,
}: {
  href?: string;
  title?: string;
  name?: string | null;
  showSignOut?: boolean;
}) {
  return <AppHeader homeHref={href} name={name} showSignOut={showSignOut} />;
}
