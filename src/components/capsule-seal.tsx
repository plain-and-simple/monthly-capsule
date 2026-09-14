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
        x="4.5"
        y="10"
        width="23"
        height="12"
        rx="6"
        fill="var(--card)"
        stroke="var(--accent)"
        strokeWidth="1.85"
      />
      <circle cx="16" cy="16" r="2.2" fill="var(--stamp)" />
      <circle cx="15.25" cy="15.25" r="0.65" fill="var(--card)" opacity="0.8" />
    </svg>
  );
}
