export function CreateSteps({ current }: { current: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Code" },
    { n: 2, label: "Account" },
    { n: 3, label: "Group" },
  ] as const;

  return (
    <div className="steps" aria-label="Create steps">
      {items.map((item, index) => {
        const state =
          item.n < current ? "steps__item--done" : item.n === current ? "steps__item--current" : "";
        return (
          <span key={item.n} className={`steps__item ${state}`.trim()}>
            {index > 0 ? <span className="steps__sep" /> : null}
            <span className="steps__num">{item.n < current ? "✓" : item.n}</span>
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
