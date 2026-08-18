import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this file, not the working directory: `prepublishOnly` runs it from packages/api.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src/api/public-api.ts");
const target = join(root, "packages/api/index.d.ts");

const banner =
  "// Generated from src/api/public-api.ts by scripts/build-api-types.mjs.\n" +
  "// Do not edit by hand — run `npm run build:api`.\n\n";

// public-api.ts describes the plugin's surface but knows nothing about the package's own
// entry point, so the locator's declaration is appended here. `import("obsidian")` is used
// inline rather than as a top-level import so the copied body stays untouched.
const locator = `
/**
 * Returns the Journals plugin API, or null when Journals is not installed, not enabled, or
 * older than the release that introduced the API.
 *
 * Call this at the point of use rather than caching it: there is no readiness event, and
 * reloading the plugin replaces the object.
 */
export declare function getJournalsApi(app: import("obsidian").App): JournalsApi | null;
`;

writeFileSync(target, banner + readFileSync(source, "utf8") + locator);
