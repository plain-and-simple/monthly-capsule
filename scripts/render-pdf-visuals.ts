import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCapsulePdfBytes } from "../src/lib/capsule-pdf";
import { buildVisualArchive } from "../src/lib/capsule-pdf-fixtures";
import { CAPSULE_THEMES } from "../src/lib/capsule-theme";

const slot = process.argv[2] === "after" ? "after" : "before";
const outDir = process.argv[3] ?? join("/tmp/pdf-visuals", slot);

async function main() {
  mkdirSync(outDir, { recursive: true });
  for (const theme of CAPSULE_THEMES) {
    const { archive, photos } = await buildVisualArchive(theme);
    const bytes = await buildCapsulePdfBytes({ archive, photos });
    const path = join(outDir, `${theme}.pdf`);
    writeFileSync(path, bytes);
    console.log(`wrote ${path} (${bytes.length} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
