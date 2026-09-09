export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <main className="flex-1">{children}</main>
    </div>
  );
}
