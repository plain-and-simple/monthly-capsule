import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PASSWORD_LABEL,
  CHROME_MARK,
  CREATE_SUCCESS_COPY,
  CREATE_SUCCESS_HINT,
  CYCLE_CLOSE_COMPILE,
  CYCLE_EMAIL_LATER,
  CYCLE_NOT_NOW,
  CYCLE_OPEN_EARLY,
  CYCLE_SECTION,
  CYCLE_SEND,
  CYCLE_SEND_AGAIN,
  CAPSULE_THEME_SAVE,
  CAPSULE_THEME_SECTION,
  FORGOT_PASSWORD_ACK,
  FORGOT_PASSWORD_HEADING,
  FORGOT_PASSWORD_LEDE,
  FORGOT_PASSWORD_LINK,
  JOIN_PIN_LABEL,
  LANDING_CREATE_LABEL,
  LANDING_CUT_PHRASES,
  LANDING_HAVE_LOGIN,
  LANDING_HEADLINE,
  LANDING_MANAGE_HEADING,
  LANDING_MONTH_GOES,
  LANDING_NEED_ACCOUNT,
  LANDING_PROMISE,
  LANDING_SIGN_IN,
  LANDING_SIGN_UP,
  CONTRIBUTORS_PREFIX,
  MANAGE_TAG_NOT_OPEN,
  MANAGE_TAG_READ,
  MANAGE_TAG_SUBMIT,
  MANAGE_TAG_SUBMITTED,
  JOIN_AUTH_HINT,
  JOIN_EXISTING_CTA,
  MANAGE_CREATE_LABEL,
  MANAGE_EMPTY_HEADING,
  MANAGE_EMPTY_HINT,
  PREFERRED_NAME_LABEL,
  PRODUCT_NAME,
  RESET_PASSWORD_HEADING,
  RESET_PASSWORD_LEDE,
  ROLE_MEMBER_LABEL,
  ROLE_OWNER_LABEL,
  GROUP_EARLIER_CAPSULES,
  GROUP_FIRST_CAPSULE_HEADING,
  GROUP_NO_PREVIOUS_CAPSULES,
  GROUP_PRIMARY_VIEW,
  SUBMIT_AND_SEND,
  SUBMIT_DRAFT,
  SUBMIT_SAVED_DRAFT,
  SUBMIT_SUBMITTED,
  TOAST_SUCCESS,
  SIGNED_OUT_TOAST,
  UNTITLED_GROUP,
  contributorsLine,
  createSuccessHero,
  groupDisplayName,
  landingChrome,
} from "./copy";

describe("landing copy smoke", () => {
  it("uses the full product name and locked promise", () => {
    const chrome = landingChrome({
      productName: PRODUCT_NAME,
      chromeMark: CHROME_MARK,
      createLabel: LANDING_CREATE_LABEL,
      promise: LANDING_PROMISE,
      manageHeading: LANDING_MANAGE_HEADING,
      signIn: LANDING_SIGN_IN,
    });
    expect(chrome.productName).toBe("Plain and Simple Monthly Capsule");
    expect(chrome.chromeMark).toBe("PS");
    expect(chrome.promise).toBe("Friends write. You get one capsule.");
    expect(LANDING_HEADLINE).toBe("Friends write. You get one capsule.");
    expect(LANDING_MONTH_GOES).toBe(
      "The window opens. Everyone writes, add a few photos, and submits. The window closes and the capsule goes out.",
    );
    expect(chrome.createLabel).toBe("Create");
    expect(chrome.manageHeading).toBe("Manage your capsule");
    expect(chrome.signIn).toBe("Sign in");
    expect(chrome.productName).not.toBe("Capsule");
    expect(chrome.chromeMark).not.toBe(chrome.productName);
  });

  it("cuts bare Capsule chrome, Create-as-link label, and No phone", () => {
    const surface = [
      PRODUCT_NAME,
      CHROME_MARK,
      LANDING_CREATE_LABEL,
      LANDING_PROMISE,
      LANDING_MANAGE_HEADING,
      LANDING_SIGN_IN,
    ].join("\n");
    for (const phrase of LANDING_CUT_PHRASES) {
      expect(surface).not.toContain(phrase);
    }
    expect(surface).not.toMatch(/^Capsule$/m);
    expect(CHROME_MARK).toBe("PS");
  });
});

describe("create success hero smoke", () => {
  it("is group name, big PIN, Copy, and show-once — no toast or join link", () => {
    const hero = createSuccessHero({ name: "Sunday letters", pin: "123456" });
    expect(hero).toEqual({
      groupName: "Sunday letters",
      pin: "123456",
      copyLabel: CREATE_SUCCESS_COPY,
      hint: CREATE_SUCCESS_HINT,
      showsJoinLink: false,
      showsToast: false,
    });
    expect(hero.copyLabel).toBe("Copy");
    expect(hero.hint).toBe("Show once — save it.");
    expect(TOAST_SUCCESS).toBe("Success");
    expect(SUBMIT_SAVED_DRAFT).toBe("Saved as draft");
    expect(SUBMIT_SUBMITTED).toBe("Submitted");
    expect(SIGNED_OUT_TOAST).toBe("Signed out");
  });

  it("uses a display name when the group name is blank", () => {
    expect(createSuccessHero({ name: "  ", pin: "000000" }).groupName).toBe(UNTITLED_GROUP);
  });
});

describe("join and manage labels", () => {
  it("keeps Group PIN vs Password distinct", () => {
    expect(JOIN_PIN_LABEL).toBe("Group PIN");
    expect(ACCOUNT_PASSWORD_LABEL).toBe("Password");
    expect(JOIN_PIN_LABEL).not.toBe(ACCOUNT_PASSWORD_LABEL);
  });

  it("asks for an account before join, then Join existing Capsule", () => {
    expect(LANDING_SIGN_UP).toBe("Create an account");
    expect(LANDING_HAVE_LOGIN).toBe("Already have a login?");
    expect(LANDING_NEED_ACCOUNT).toBe("Need an account?");
    expect(JOIN_EXISTING_CTA).toBe("Join existing Capsule");
    expect(JOIN_AUTH_HINT).toMatch(/Group PIN/);
    expect(JOIN_EXISTING_CTA).not.toBe("Create Capsule Group");
  });

  it("labels preferred name and manage-0 copy", () => {
    expect(PREFERRED_NAME_LABEL).toBe("Preferred name");
    expect(MANAGE_EMPTY_HEADING).toBe("No groups yet");
    expect(MANAGE_EMPTY_HINT).toBe("Have a link? Open it to join.");
    expect(MANAGE_CREATE_LABEL).toBe("Create");
    expect(ROLE_OWNER_LABEL).toBe("Owner");
    expect(ROLE_MEMBER_LABEL).toBe("Member");
  });

  it("brands password reset as Plain and Simple Monthly Capsule", () => {
    expect(FORGOT_PASSWORD_LINK).toBe("Forgot password?");
    expect(FORGOT_PASSWORD_HEADING).toBe("Reset your password");
    expect(RESET_PASSWORD_HEADING).toBe("Choose a new password");
    expect(FORGOT_PASSWORD_LEDE).toContain(PRODUCT_NAME);
    expect(RESET_PASSWORD_LEDE).toContain(PRODUCT_NAME);
    expect(FORGOT_PASSWORD_ACK).toBe("If that email has an account, we sent a reset link.");
    expect(FORGOT_PASSWORD_LEDE).not.toMatch(/^Enter the email for your Monthly Capsule/);
  });

  it("locks closed-home capsule labels", () => {
    expect(GROUP_PRIMARY_VIEW).toBe("Read the capsule");
    expect(GROUP_EARLIER_CAPSULES).toBe("Earlier capsules");
  });

  it("locks first-run and empty-state capsule labels", () => {
    expect(GROUP_FIRST_CAPSULE_HEADING).toBe("Your first capsule");
    expect(GROUP_NO_PREVIOUS_CAPSULES).toBe("No previous capsules yet");
    expect(GROUP_EARLIER_CAPSULES).toBe("Earlier capsules");
  });

  it("locks submit model A labels", () => {
    expect(SUBMIT_DRAFT).toBe("Save as draft");
    expect(SUBMIT_AND_SEND).toBe("Save and submit");
  });

  it("locks owner force-cycle labels", () => {
    expect(CYCLE_SECTION).toBe("Capsule cycle");
    expect(CYCLE_OPEN_EARLY).toBe("Open submit early");
    expect(CYCLE_CLOSE_COMPILE).toBe("Close & make capsule");
    expect(CYCLE_SEND).toBe("Send");
    expect(CYCLE_SEND_AGAIN).toBe("Send again");
    expect(CYCLE_NOT_NOW).toBe("Not now");
    expect(CYCLE_EMAIL_LATER).toBe("Email group");
    expect(CAPSULE_THEME_SECTION).toBe("Capsule theme");
    expect(CAPSULE_THEME_SAVE).toBe("Save theme");
  });

  it("labels manage-row actions and capsule contributors", () => {
    expect(MANAGE_TAG_SUBMIT).toBe("Submit capsule");
    expect(MANAGE_TAG_SUBMITTED).toBe("Capsule already submitted");
    expect(MANAGE_TAG_READ).toBe("Read latest capsule");
    expect(MANAGE_TAG_NOT_OPEN).toBe("Next capsule not open");
    expect(contributorsLine(["Ada", "Sam", "Sam"])).toBe(`${CONTRIBUTORS_PREFIX} Ada, Sam, Sam`);
    expect(contributorsLine([])).toBe("");
  });

  it("never falls back to bare Capsule for a group name", () => {
    expect(groupDisplayName("")).toBe(UNTITLED_GROUP);
    expect(groupDisplayName("  ")).toBe(UNTITLED_GROUP);
    expect(groupDisplayName("Kitchen")).toBe("Kitchen");
    expect(groupDisplayName(null)).not.toBe("Capsule");
  });
});
