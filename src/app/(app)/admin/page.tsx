import { AppHeader } from "@/components/app-header";
import { StudioBanForm } from "@/components/studio-ban-form";
import { StudioGateForm } from "@/components/studio-gate-form";
import {
  STUDIO_ADMIN_COMPILES,
  STUDIO_ADMIN_HEADING,
  STUDIO_ADMIN_LEDE,
  STUDIO_ADMIN_MEMBERS,
} from "@/lib/copy";
import { parseFlashError } from "@/lib/session-policy";
import { loadStudioGroupCounts } from "@/lib/studio-admin-store";
import { getStudioSession } from "@/lib/studio-session";

export const dynamic = "force-dynamic";

export default async function StudioAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const error = parseFlashError((await searchParams).error);
  const studio = await getStudioSession();

  if (!studio) {
    return (
      <>
        <AppHeader homeHref="/" />
        <main className="main main--centered">
          <div className="wrap wrap--narrow">
            <div className="card card--pad-lg">
              <StudioGateForm error={error} />
            </div>
          </div>
        </main>
      </>
    );
  }

  const groups = await loadStudioGroupCounts();

  return (
    <>
      <AppHeader homeHref="/admin" />
      <main className="main">
        <div className="wrap">
          <div className="stack stack--loose">
            <div className="stack stack--tight">
              <h1>{STUDIO_ADMIN_HEADING}</h1>
              <p className="muted small">{STUDIO_ADMIN_LEDE}</p>
            </div>

            <p className="muted small">
              {groups.length} {groups.length === 1 ? "group" : "groups"}.
            </p>

            {groups.length === 0 ? (
              <p className="muted small">No groups yet.</p>
            ) : (
              <ul className="list">
                {groups.map((group) => (
                  <li key={group.groupId}>
                    <div className="listitem">
                      <span className="listitem__body">
                        <span className="listitem__title">{group.groupName}</span>
                        <span className="listitem__meta">
                          {STUDIO_ADMIN_MEMBERS} {group.memberCount}
                        </span>
                      </span>
                      <span className="listitem__end">
                        {STUDIO_ADMIN_COMPILES} {group.compileCount}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <hr className="rule" />
            <StudioBanForm />
          </div>
        </div>
      </main>
    </>
  );
}
