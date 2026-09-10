export const PRODUCT_NAME = "Plain and Simple Monthly Capsule";

export const LANDING_PROMISE = "Friends write once a month. You get one capsule.";
export const LANDING_CREATE_LABEL = "Create";
export const LANDING_CREATE_CTA = "Create a capsule group";
export const LANDING_MANAGE_HEADING = "Manage your capsule";
export const LANDING_SIGN_IN = "Sign in";
export const LANDING_LEDE =
  "A private page for a small group. Everyone sends a short letter and a few photos during the month. When the window closes, it all arrives as one thing to read.";

export const CREATE_SUCCESS_HINT = "Show once — save it.";
export const CREATE_SUCCESS_COPY = "Copy";

export const MANAGE_EMPTY_HEADING = "No groups yet";
export const MANAGE_EMPTY_TITLE = "Your groups";
export const MANAGE_EMPTY_HINT = "Have a link? Open it to join.";
export const MANAGE_CREATE_LABEL = "Create";
export const ROLE_OWNER_LABEL = "Owner";
export const ROLE_MEMBER_LABEL = "Member";
export const SIGN_OUT = "Sign out";
export const LEAVE_GROUP = "Leave this group";

export const JOIN_PIN_LABEL = "Group PIN";
export const ACCOUNT_PASSWORD_LABEL = "Password";
export const PREFERRED_NAME_LABEL = "Preferred name";

export const INVITE_HELPER =
  "Share the link. Type the PIN if you have it. We never show it again.";

export const GROUP_PRIMARY_SUBMIT = "Write your letter";
export const GROUP_PRIMARY_VIEW = "Read the capsule";
export const GROUP_EARLIER_CAPSULES = "Earlier capsules";
export const GROUP_PRIMARY_EDIT = "Edit until the window closes";
export const SUBMIT_DRAFT = "Save as draft";
export const SUBMIT_AND_SEND = "Save and submit";

export const CYCLE_SECTION = "Capsule cycle";
export const CYCLE_OPEN_EARLY = "Open submit early";
export const CYCLE_CLOSE_COMPILE = "Close & make capsule";
export const CYCLE_SEND = "Send";
export const CYCLE_NOT_NOW = "Not now";
export const CYCLE_EMAIL_LATER = "Email group";

export const UNTITLED_GROUP = "Untitled group";

export const LANDING_CUT_PHRASES = ["No phone.", "Create Capsule Group"] as const;

export function groupDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed || UNTITLED_GROUP;
}

export type CreateSuccessHero = {
  groupName: string;
  pin: string;
  copyLabel: string;
  hint: string;
  showsJoinLink: false;
  showsToast: false;
};

export function createSuccessHero(input: { name: string; pin: string }): CreateSuccessHero {
  return {
    groupName: groupDisplayName(input.name),
    pin: input.pin,
    copyLabel: CREATE_SUCCESS_COPY,
    hint: CREATE_SUCCESS_HINT,
    showsJoinLink: false,
    showsToast: false,
  };
}

export function landingChrome(input: {
  productName: string;
  createLabel: string;
  promise: string;
  manageHeading: string;
  signIn: string;
}): { productName: string; createLabel: string; promise: string; manageHeading: string; signIn: string } {
  return input;
}
