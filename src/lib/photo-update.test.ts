import { describe, expect, it } from "vitest";
import { parseKeepPhotoIds, planPhotoUpdate } from "./photo-update";

describe("photo keep / add / remove", () => {
  const existing = [
    { id: "a", storage_path: "g/m/s/0.jpg", sort_order: 0 },
    { id: "b", storage_path: "g/m/s/1.jpg", sort_order: 1 },
    { id: "c", storage_path: "g/m/s/2.jpg", sort_order: 2 },
  ];

  it("keeps listed photos and removes the rest", () => {
    const plan = planPhotoUpdate({
      existing,
      keepIds: ["a", "c"],
      newFileCount: 0,
    });
    expect(plan.error).toBeNull();
    expect(plan.keep.map((photo) => photo.id)).toEqual(["a", "c"]);
    expect(plan.remove.map((photo) => photo.id)).toEqual(["b"]);
    expect(plan.nextSortStart).toBe(2);
  });

  it("adds new files after kept photos without wiping them", () => {
    const plan = planPhotoUpdate({
      existing,
      keepIds: ["a", "b", "c"],
      newFileCount: 2,
    });
    expect(plan.error).toBeNull();
    expect(plan.remove).toEqual([]);
    expect(plan.nextSortStart).toBe(3);
  });

  it("rejects going over the max", () => {
    const plan = planPhotoUpdate({
      existing,
      keepIds: ["a", "b", "c"],
      newFileCount: 4,
      maxPhotos: 6,
    });
    expect(plan.error).toBe("Max 6 photos.");
  });

  it("can clear every photo", () => {
    const plan = planPhotoUpdate({
      existing,
      keepIds: [],
      newFileCount: 0,
    });
    expect(plan.remove.map((photo) => photo.id)).toEqual(["a", "b", "c"]);
    expect(plan.keep).toEqual([]);
    expect(plan.nextSortStart).toBe(0);
  });

  it("parses keep ids from form values", () => {
    expect(parseKeepPhotoIds(["a", " ", "b", ""])).toEqual(["a", "b"]);
  });
});
