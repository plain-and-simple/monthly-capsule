export type DetectedFaceBox = { x: number; y: number; w: number; h: number };

type DetectedFace = { boundingBox: { x: number; y: number; width: number; height: number } };

type FaceDetectorCtor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect: (source: ImageBitmap) => Promise<DetectedFace[]>;
};

/**
 * Browser FaceDetector only. Safari and Firefox have no implementation;
 * an empty list tells the PDF to trim evenly. No model is downloaded.
 */
export async function detectPhotoFaces(blob: Blob): Promise<DetectedFaceBox[]> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return [];
  const Detector = (window as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (!Detector) return [];
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const width = bitmap.width || 1;
    const height = bitmap.height || 1;
    const faces = await new Detector({ fastMode: true, maxDetectedFaces: 8 }).detect(bitmap);
    const boxes: DetectedFaceBox[] = [];
    for (const face of faces) {
      const box = face.boundingBox;
      if (!box || box.width <= 1 || box.height <= 1) continue;
      const x = box.x / width;
      const y = box.y / height;
      const w = box.width / width;
      const h = box.height / height;
      if (![x, y, w, h].every((n) => Number.isFinite(n))) continue;
      if (w < 0.01 || h < 0.01) continue;
      boxes.push({
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
        w: Math.min(1, Math.max(0, w)),
        h: Math.min(1, Math.max(0, h)),
      });
      if (boxes.length >= 12) break;
    }
    return boxes;
  } catch {
    return [];
  } finally {
    bitmap?.close();
  }
}
