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

writeFileSync(target, banner + readFileSync(source, "utf8"));
