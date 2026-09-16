export const PRODUCT_NAME = "Plain and Simple Monthly Capsule";
/** Letters drawn in the header lockup. The mark SVG already includes PS — do not also render this as text. */
export const CHROME_MARK = "PS";

export const LANDING_PROMISE = "Friends write once a month. You get one capsule.";
export const LANDING_CREATE_LABEL = "Create";
export const LANDING_CREATE_CTA = "Create a capsule group";
export const LANDING_MANAGE_HEADING = "Manage your capsule";
export const LANDING_SIGN_IN = "Sign in";
export const LANDING_SIGN_UP = "Create an account";
export const LANDING_HAVE_LOGIN = "Already have a login?";
export const LANDING_NEED_ACCOUNT = "Need an account?";
export const JOIN_EXISTING_CTA = "Join existing Capsule";
export const JOIN_AUTH_HINT =
  "Create an account or sign in. Then you can enter the Group PIN and join.";
export const SAVE_LOGIN_REQUIRED_HEADING = "Save a login";
export const SAVE_LOGIN_REQUIRED_HINT =
  "Email and password are required before you can save a letter. That is how we email the capsule.";
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

export const PEOPLE_REMOVE = "Remove";
export const PEOPLE_REMOVE_CONFIRM =
  "Remove them from the group? They cannot submit while the window is open. Letters already in a capsule stay.";
export const PEOPLE_REMOVE_CONFIRM_ACTION = "Remove";
export const PEOPLE_REMOVED = "Removed.";

export const STUDIO_ADMIN_HEADING = "Studio";
export const STUDIO_ADMIN_LEDE = "Counts only. No letters, photos, or emails.";
export const STUDIO_ADMIN_GROUPS = "Groups";
export const STUDIO_ADMIN_MEMBERS = "Members";
export const STUDIO_ADMIN_COMPILES = "Compiles";
export const STUDIO_BAN_HEADING = "Ban an account";
export const STUDIO_BAN_HINT = "Manage login, submit, create, and join all fail.";
export const STUDIO_BAN_CONFIRM = "Ban this account?";
export const STUDIO_BAN_ACTION = "Ban";
export const STUDIO_BAN_DONE = "Account banned.";

export const JOIN_PIN_LABEL = "Group PIN";
export const ACCOUNT_PASSWORD_LABEL = "Password";
export const PREFERRED_NAME_LABEL = "Preferred name";

export const FORGOT_PASSWORD_LINK = "Forgot password?";
export const FORGOT_PASSWORD_HEADING = "Reset your password";
export const FORGOT_PASSWORD_LEDE =
  "Enter the email for your Plain and Simple Monthly Capsule account. If we have it, we will send a reset link.";
export const FORGOT_PASSWORD_ACK =
  "If that email has an account, we sent a reset link.";
export const FORGOT_PASSWORD_SUBMIT = "Send reset link";
export const RESET_PASSWORD_HEADING = "Choose a new password";
export const RESET_PASSWORD_LEDE =
  "Pick a new password for your Plain and Simple Monthly Capsule account. Then you will be signed in.";
export const RESET_PASSWORD_SUBMIT = "Set new password";
export const RESET_LINK_INVALID = "This reset link is not valid. Request a new one.";
export const RESET_REQUEST_NEW = "Request a new link";

export const INVITE_HELPER =
  "Share the link. Type the PIN if you have it. We never show it again.";

export const GROUP_PRIMARY_SUBMIT = "Write your letter";
export const GROUP_PRIMARY_VIEW = "Read the capsule";
export const GROUP_EARLIER_CAPSULES = "Earlier capsules";
export const GROUP_FIRST_CAPSULE_HEADING = "Your first capsule";
export const GROUP_NO_PREVIOUS_CAPSULES = "No previous capsules yet";
export const GROUP_PRIMARY_EDIT = "Edit until the window closes";
export const SUBMIT_DRAFT = "Save as draft";
export const SUBMIT_AND_SEND = "Save and submit";
export const SUBMIT_SAVED_DRAFT = "Saved as draft";
export const SUBMIT_SUBMITTED = "Submitted";
export const TOAST_SUCCESS = "Success";
export const TOAST_DISMISS = "Dismiss";
export const SIGNED_OUT_TOAST = "Signed out";

export const CYCLE_SECTION = "Capsule cycle";
export const CYCLE_OPEN_EARLY = "Open submit early";
export const CYCLE_CLOSE_COMPILE = "Close & make capsule";
export const CYCLE_SEND = "Send";
export const CYCLE_SEND_AGAIN = "Send again";
export const CYCLE_SEND_AGAIN_HINT = "Sends again from Capsule with the locked subject.";
export const CYCLE_NOT_NOW = "Not now";
export const CYCLE_EMAIL_LATER = "Email group";

export const CAPSULE_THEME_SECTION = "Capsule theme";
export const CAPSULE_THEME_HINT =
  "Used the next time a capsule is made. Past months stay as they were.";
export const CAPSULE_THEME_SAVE = "Save theme";
export const CAPSULE_THEME_INVALID = "Pick a theme.";

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
  chromeMark: string;
  createLabel: string;
  promise: string;
  manageHeading: string;
  signIn: string;
}): {
  productName: string;
  chromeMark: string;
  createLabel: string;
  promise: string;
  manageHeading: string;
  signIn: string;
} {
  return input;
}
