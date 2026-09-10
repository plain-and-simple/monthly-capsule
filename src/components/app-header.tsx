import { logoutAccount } from "@/actions/logout";
import { Brand } from "@/components/brand";
import { SIGN_OUT } from "@/lib/copy";

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
            {showSignOut ? (
              <form action={logoutAccount}>
                <button type="submit" className="signout">
                  {SIGN_OUT}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
