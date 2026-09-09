export const CHICAGO_TZ = "America/Chicago";

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_EDGE_PX = 1600;
export const MAX_PHOTO_BYTES = 2_097_152;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const PIN_ATTEMPT_MAX = 5;

export const PHOTO_BUCKET = "capsule-photos";

export const SESSION_COOKIE = "capsule_session";
export const ACCOUNT_COOKIE = "capsule_account";

export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ATTEMPT_MAX = 5;

export const DEFAULT_SUBMIT_START_DAY = 1;
export const DEFAULT_SUBMIT_END_DAY = 8;
export const DEFAULT_EMAIL_DAY = 9;
