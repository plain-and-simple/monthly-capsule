import { describe, expect, it } from "vitest";
import { buildCapsuleArchive } from "./capsule-archive";
import {
  buildCapsulePdfBytes,
  capsulePdfFilename,
  capsulePdfHref,
  capsulePdfStoragePath,
  detectImageKind,
} from "./capsule-pdf";

/** Minimal valid 1×1 JPEG */
const TINY_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAADBAECBQYAB//EAD0QAAIBAgQDBgQEBQUBAAAAAAECAwQRAAUSITFBBhMiUWEycYGRoQcjQrHB0RTh8PEVYnKS/8QAGQEAAwEBAQAAAAAAAAAAAAAAAAECAwQF/8QAIhEAAgICAgMBAQEAAAAAAAAAAAECEQMhEjFBBFEiYXEy/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
    "base64",
  ),
);

describe("capsule pdf helpers", () => {
  it("builds stable storage paths and download hrefs", () => {
    expect(capsulePdfStoragePath("g1", "2026-09", 1)).toBe("g1/pdfs/2026-09/v1.pdf");
    expect(capsulePdfHref("g1", "2026-09", 1)).toBe("/g/g1/capsule/2026-09/pdf");
    expect(capsulePdfHref("g1", "2026-09", 2)).toBe("/g/g1/capsule/2026-09/v2/pdf");
    expect(capsulePdfFilename("Cedar Street", "2026-09", 1)).toBe("cedar-street-2026-09.pdf");
    expect(capsulePdfFilename("Cedar Street", "2026-09", 2)).toBe("cedar-street-2026-09-v2.pdf");
  });

  it("detects jpeg and rejects unknown bytes", () => {
    expect(detectImageKind(TINY_JPEG)).toBe("jpeg");
    expect(detectImageKind(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("renders a PDF with letter text and embedded photo bytes", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 2,
      letters: [
        {
          preferred_name: "Wren",
          body: "The plum tree finally did something.",
          photos: [{ storage_path: "g/m/0.jpg", width: 1, height: 1, sort_order: 0 }],
        },
      ],
    });

    const bytes = await buildCapsulePdfBytes({
      archive,
      photos: [{ storage_path: "g/m/0.jpg", bytes: TINY_JPEG }],
    });

    expect(Buffer.from(bytes.slice(0, 4)).toString("ascii")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("still renders when a photo cannot be embedded", async () => {
    const archive = buildCapsuleArchive({
      yearMonth: "2026-09",
      groupName: "Cedar Street",
      memberCount: 1,
      letters: [
        {
          preferred_name: "Wren",
          body: "Hello",
          photos: [{ storage_path: "missing.webp", width: 10, height: 10, sort_order: 0 }],
        },
      ],
    });
    const bytes = await buildCapsulePdfBytes({
      archive,
      photos: [{ storage_path: "missing.webp", bytes: new Uint8Array([0, 1, 2, 3]) }],
    });
    expect(Buffer.from(bytes.slice(0, 4)).toString("ascii")).toBe("%PDF");
  });
});
