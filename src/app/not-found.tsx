import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="space-y-3">
        <h1 className="font-serif text-4xl">Not found</h1>
        <Link href="/" className="text-muted">
          Home
        </Link>
      </div>
    </div>
  );
}
