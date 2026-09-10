import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PASSWORD_LABEL,
  CREATE_SUCCESS_COPY,
  CREATE_SUCCESS_HINT,
  CYCLE_CLOSE_COMPILE,
  CYCLE_EMAIL_LATER,
  CYCLE_NOT_NOW,
  CYCLE_OPEN_EARLY,
  CYCLE_SECTION,
  CYCLE_SEND,
  JOIN_PIN_LABEL,
  LANDING_CREATE_LABEL,
  LANDING_CUT_PHRASES,
  LANDING_MANAGE_HEADING,
  LANDING_PROMISE,
  LANDING_SIGN_IN,
  MANAGE_CREATE_LABEL,
  MANAGE_EMPTY_HEADING,
  MANAGE_EMPTY_HINT,
  PREFERRED_NAME_LABEL,
  PRODUCT_NAME,
  ROLE_MEMBER_LABEL,
  ROLE_OWNER_LABEL,
  GROUP_EARLIER_CAPSULES,
  GROUP_PRIMARY_VIEW,
  SUBMIT_AND_SEND,
  SUBMIT_DRAFT,
  UNTITLED_GROUP,
  createSuccessHero,
  groupDisplayName,
  landingChrome,
} from "./copy";

describe("landing copy smoke", () => {
  it("uses the full product name and locked promise", () => {
    const chrome = landingChrome({
      productName: PRODUCT_NAME,
      createLabel: LANDING_CREATE_LABEL,
      promise: LANDING_PROMISE,
      manageHeading: LANDING_MANAGE_HEADING,
      signIn: LANDING_SIGN_IN,
    });
    expect(chrome.productName).toBe("Plain and Simple Monthly Capsule");
    expect(chrome.promise).toBe("Friends write once a month. You get one capsule.");
    expect(chrome.createLabel).toBe("Create");
    expect(chrome.manageHeading).toBe("Manage your capsule");
    expect(chrome.signIn).toBe("Sign in");
    expect(chrome.productName).not.toBe("Capsule");
  });

  it("cuts bare Capsule chrome, Create-as-link label, and No phone", () => {
    const surface = [
      PRODUCT_NAME,
      LANDING_CREATE_LABEL,
      LANDING_PROMISE,
      LANDING_MANAGE_HEADING,
      LANDING_SIGN_IN,
    ].join("\n");
    for (const phrase of LANDING_CUT_PHRASES) {
      expect(surface).not.toContain(phrase);
    }
    expect(surface).not.toMatch(/^Capsule$/m);
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

  it("labels preferred name and manage-0 copy", () => {
    expect(PREFERRED_NAME_LABEL).toBe("Preferred name");
    expect(MANAGE_EMPTY_HEADING).toBe("No groups yet");
    expect(MANAGE_EMPTY_HINT).toBe("Have a link? Open it to join.");
    expect(MANAGE_CREATE_LABEL).toBe("Create");
    expect(ROLE_OWNER_LABEL).toBe("Owner");
    expect(ROLE_MEMBER_LABEL).toBe("Member");
  });

  it("locks closed-home capsule labels", () => {
    expect(GROUP_PRIMARY_VIEW).toBe("Read the capsule");
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
    expect(CYCLE_NOT_NOW).toBe("Not now");
    expect(CYCLE_EMAIL_LATER).toBe("Email group");
  });

  it("never falls back to bare Capsule for a group name", () => {
    expect(groupDisplayName("")).toBe(UNTITLED_GROUP);
    expect(groupDisplayName("  ")).toBe(UNTITLED_GROUP);
    expect(groupDisplayName("Kitchen")).toBe("Kitchen");
    expect(groupDisplayName(null)).not.toBe("Capsule");
  });
});
