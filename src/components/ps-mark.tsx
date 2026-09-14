/** PS lockup: letters + letter-tile + step bar. The mark already includes PS. */
export function PsMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 322 173"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" fillRule="evenodd" d={LETTER_P} />
      <path fill="currentColor" fillRule="evenodd" d={LETTER_S} />
      <path fill="currentColor" fillRule="evenodd" d={LETTER_TILE} />
      <circle cx="22.5" cy="151" r="21.5" fill="currentColor" />
      <rect x="56" y="131" width="62" height="40" rx="6.5" fill="currentColor" />
      <rect x="131" y="131" width="62" height="40" rx="6.5" fill="currentColor" />
      <rect x="206" y="131" width="62" height="40" rx="6.5" fill="currentColor" />
      <circle cx="300" cy="151" r="21" fill="#e08b4a" />
    </svg>
  );
}

const LETTER_P =
  "M1 4H58L59 5H64L75 10L81 15L86 24L88 31L87 51L83 60L79 65L75 68L63 73H58L57 74H26L24 76V114H1V5Z M26 23H52L59 26L63 30L65 35V42L64 43V46L62 49L59 52L51 55H26L25 54V24Z";

const LETTER_S =
  "M131 1L147 2L158 5L167 10L172 15L177 24L178 36H156L153 27L146 21L139 19L126 20L122 22L118 26L116 30V35L121 41L131 45L163 53L175 61L178 65L182 75L181 92L175 103L168 109L156 114L147 115L146 116H128L127 115L118 114L106 109L96 100L93 95L90 85V78H112L113 84L115 88L121 94L130 98H146L149 97L153 95L159 88L160 85L159 80L152 73L142 69L114 62L103 56L99 52L95 45L94 42V27L99 16L106 9L111 6L119 3L130 2Z";

const LETTER_TILE =
  "M225 8H301A12 12 0 0 1 313 20V96A12 12 0 0 1 301 108H225A12 12 0 0 1 213 96V20A12 12 0 0 1 225 8ZM228.5 19.8H297.5A5.5 5.5 0 0 1 303 25.3V30.1A5.5 5.5 0 0 1 297.5 35.6H228.5A5.5 5.5 0 0 1 223 30.1V25.3A5.5 5.5 0 0 1 228.5 19.8ZM227 45.3H257.6A4 4 0 0 1 261.6 49.3A4 4 0 0 1 257.6 53.3H227A4 4 0 0 1 223 49.3A4 4 0 0 1 227 45.3ZM276.4 45.3H296.1A7 7 0 0 1 303.1 52.3V72A7 7 0 0 1 296.1 79H276.4A7 7 0 0 1 269.4 72V52.3A7 7 0 0 1 276.4 45.3ZM227 59.5H253.8A4 4 0 0 1 257.8 63.5A4 4 0 0 1 253.8 67.5H227A4 4 0 0 1 223 63.5A4 4 0 0 1 227 59.5ZM227 73.3H247.8A4 4 0 0 1 251.8 77.3A4 4 0 0 1 247.8 81.3H227A4 4 0 0 1 223 77.3A4 4 0 0 1 227 73.3ZM227 88.2H299A4 4 0 0 1 303 92.2A4 4 0 0 1 299 96.2H227A4 4 0 0 1 223 92.2A4 4 0 0 1 227 88.2Z";
