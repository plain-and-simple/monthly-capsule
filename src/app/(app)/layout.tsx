import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <header className="mb-10">
        <Link href="/" className="font-serif text-xl tracking-tight">
          Capsule
        </Link>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
