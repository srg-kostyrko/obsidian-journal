/// <reference types="node/fs" />
/// <reference types="node/url" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { appearanceCatalog } from "./appearance-catalog";
import { gateSnippet, narrowGate } from "./gate-snippet";

// Read off disk: a `?raw` CSS import comes back empty under vitest. Bound first: Vite rewrites a
// literal `new URL("...", import.meta.url)` into an asset URL. scripts/gen-appearance-gate-snippet.mjs
// writes this same path.
const here = import.meta.url;
const SNIPPET = "../../../e2e-tests/fixtures/e2e-appearance-snippets/.obsidian/snippets/journal-gate.css";

describe("gate snippet", () => {
  it("the gate snippet matches the catalog", () => {
    const committed = readFileSync(fileURLToPath(new URL(SNIPPET, here)), "utf8");

    expect(committed, "stale: run `npm run gen:appearance-gate`").toBe(gateSnippet());
  });

  it("sets each entry with a stock narrow value through its narrow name, under its narrow gate", () => {
    const snippet = gateSnippet();
    const narrow = appearanceCatalog.filter((entry) => entry.stockNarrow !== undefined);

    expect(narrow.length).toBeGreaterThan(0);
    for (const entry of narrow) {
      expect(snippet).toContain(
        `[data-appearance-gate="${narrowGate(entry)}"] {\n  --${entry.name}-narrow: ${entry.probe.sample};`,
      );
    }
    expect(snippet.match(/:narrow"\]/g)).toHaveLength(narrow.length);
  });
});
