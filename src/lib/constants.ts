export const CHICAGO_TZ = "America/Chicago";

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_EDGE_PX = 1600;
/** Stored + posted compressed photo cap (1 MB). Camera originals are never kept. */
export const MAX_PHOTO_BYTES = 1_048_576;
/** First encode quality (canvas 0–1 / sharp × 100). In the locked 0.7–0.8 band. */
export const PHOTO_ENCODE_QUALITY = 0.8;
export const PHOTO_ENCODE_QUALITY_MIN = 0.5;
export const PHOTO_ENCODE_QUALITY_STEP = 0.1;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Server Action body must stay ≥ this (6 × 1 MB + letter + form overhead). */
export const PHOTO_POST_BUDGET_BYTES = MAX_PHOTOS * MAX_PHOTO_BYTES + 512_000;

export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const PIN_ATTEMPT_MAX = 5;

export const PHOTO_BUCKET = "capsule-photos";

export const SESSION_COOKIE = "capsule_session";
export const ACCOUNT_COOKIE = "capsule_account";

export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ATTEMPT_MAX = 5;

export const PASSWORD_RESET_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_ATTEMPT_MAX = 5;
export const RESET_TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const DEFAULT_SUBMIT_START_DAY = 1;
export const DEFAULT_SUBMIT_END_DAY = 8;
export const DEFAULT_EMAIL_DAY = 9;
