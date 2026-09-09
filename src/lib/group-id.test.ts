import { describe, expect, it } from "vitest";
import { parseGroupId } from "./group-id";

const id = "550e8400-e29b-41d4-a716-446655440000";

describe("parseGroupId", () => {
  it("accepts a raw group ID", () => {
    expect(parseGroupId(id)).toBe(id);
    expect(parseGroupId(`  ${id.toUpperCase()}  `)).toBe(id);
  });

  it("accepts a pasted join link", () => {
    expect(parseGroupId(`https://capsule.plainandsimple.app/join/${id}`)).toBe(id);
    expect(parseGroupId(`http://localhost:3000/join/${id}/`)).toBe(id);
    expect(parseGroupId(`/join/${id}?src=home`)).toBe(id);
  });

  it("returns null for junk", () => {
    expect(parseGroupId("")).toBeNull();
    expect(parseGroupId("not-a-group")).toBeNull();
    expect(parseGroupId("https://capsule.plainandsimple.app/create")).toBeNull();
  });
});
