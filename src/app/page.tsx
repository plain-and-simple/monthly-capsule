import Link from "next/link";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  return (
    <nav className="flex flex-col gap-3" aria-label="Home">
      <Link className="btn" href="/create">
        Create a group
      </Link>
      <Link className="btn btn-ghost" href="/join">
        Join a group
      </Link>
      {session ? (
        <Link className="btn btn-ghost" href={`/g/${session.groupId}`}>
          Open your capsule
        </Link>
      ) : null}
    </nav>
  );
}
