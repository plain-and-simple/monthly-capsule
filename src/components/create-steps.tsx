export function CreateSteps({
  current,
  skipAccount = false,
}: {
  current: 1 | 2 | 3;
  skipAccount?: boolean;
}) {
  const items = skipAccount
    ? [
        { key: 1, label: "Code", step: 1 as const },
        { key: 2, label: "Group", step: 3 as const },
      ]
    : [
        { key: 1, label: "Code", step: 1 as const },
        { key: 2, label: "Account", step: 2 as const },
        { key: 3, label: "Group", step: 3 as const },
      ];

  return (
    <div className="steps" aria-label="Create steps">
      {items.map((item, index) => {
        const state =
          item.step < current ? "steps__item--done" : item.step === current ? "steps__item--current" : "";
        return (
          <span key={item.key} className={`steps__item ${state}`.trim()}>
            {index > 0 ? <span className="steps__sep" /> : null}
            <span className="steps__num">{item.step < current ? "✓" : item.key}</span>
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
