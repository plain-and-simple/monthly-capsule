/** Capsule seal mark: a soft pill with a centered seal dot. Not an envelope, not a photo stack. */
export function CapsuleSeal({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.5"
        y="9"
        width="25"
        height="14"
        rx="7"
        fill="var(--card)"
        stroke="var(--accent)"
        strokeWidth="2"
      />
      <circle cx="16" cy="16" r="3.1" fill="var(--stamp)" />
      <circle cx="15.05" cy="15.05" r="0.9" fill="var(--card)" opacity="0.85" />
    </svg>
  );
}
