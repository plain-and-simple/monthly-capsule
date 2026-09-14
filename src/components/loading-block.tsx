export function LoadingBlock({ label = "Working…" }: { label?: string }) {
  return (
    <main className="main">
      <div className="wrap">
        <p className="status status--pending" role="status">
          <span className="dot" />
          {label}
        </p>
      </div>
    </main>
  );
}
