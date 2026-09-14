import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";

export function AppHeader({
  name,
  showSignOut = false,
  homeHref = "/",
}: {
  name?: string | null;
  showSignOut?: boolean;
  homeHref?: string;
}) {
  return (
    <header className="topbar">
      <div className="wrap wrap--wide topbar__inner">
        <Brand href={homeHref} />
        {name || showSignOut ? (
          <div className="topbar__account">
            {name ? <span>{name}</span> : null}
            {showSignOut ? <SignOutButton /> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
