// See src/code-blocks/manual-fences.test.ts for why only these Node submodules are referenced.
/// <reference types="node/fs" />
/// <reference types="node/url" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { appearanceCatalog } from "./appearance-catalog";

// Bound to a variable first; see manual-fences.test.ts for the Vite rewrite this avoids.
const here = import.meta.url;
const PAGE = fileURLToPath(new URL("../../../docs/user/reference/css-variables.md", here));

// The page's snippets, in the order it shows them. The one-view rule is asserted by
// e2e-tests/journeys/appearance-snippets.e2e.ts; the examples are run by
// e2e-tests/screenshots/css-variables.shot.ts.
const EXAMPLE_SNIPPETS = [
  "e2e-appearance-snippets/.obsidian/snippets/one-view",
  ...["today-background", "weekend-band", "narrow-rows"].map(
    (name) => `e2e-docs-css-variables/.obsidian/snippets/${name}`,
  ),
].map((path) => fileURLToPath(new URL(`../../../e2e-tests/fixtures/${path}.css`, here)));

const INHERITED = "inherited";
const NONE = "—";

interface DocumentedRow {
  readonly name: string;
  readonly stock: string;
  readonly stockNarrow: string;
}

function cellValue(cell: string): string {
  const code = /^`([^`]*)`$/.exec(cell);
  return code?.[1] ?? cell;
}

/** Rows of every table whose first cell is a `--journal-…` name: Variable | Changes | Default | Narrow default. */
function documentedRows(page: string): DocumentedRow[] {
  return page
    .split("\n")
    .filter((line) => /^\|\s*`--journal-/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        name: cellValue(cells[0] ?? "").replace(/^--/, ""),
        stock: cellValue(cells[2] ?? ""),
        stockNarrow: cellValue(cells[3] ?? ""),
      };
    });
}

function catalogRows(): DocumentedRow[] {
  return appearanceCatalog.map((entry) => ({
    name: entry.name,
    stock: entry.stock === "" ? INHERITED : entry.stock,
    stockNarrow: entry.stockNarrow ?? NONE,
  }));
}

function byName(rows: DocumentedRow[]): DocumentedRow[] {
  return rows.toSorted((left, right) => left.name.localeCompare(right.name));
}

function cssFences(page: string): string[] {
  return [...page.matchAll(/^```css\n([\s\S]*?)^```$/gm)].map((match) => match[1] ?? "");
}

describe("documentedRows", () => {
  it("reads name, stock and narrow stock, ignoring the description", () => {
    const page = [
      "| Variable | Changes | Default | Narrow default |",
      "| --- | --- | --- | --- |",
      "| `--journal-cell-date-size` | Size | `1.1em` | `1em` |",
      "| `--journal-cell-today-text-weight` | Weight | inherited | — |",
      "Prose mentioning `--journal-cell-x`.",
    ].join("\n");
    expect(documentedRows(page)).toEqual([
      { name: "journal-cell-date-size", stock: "1.1em", stockNarrow: "1em" },
      { name: "journal-cell-today-text-weight", stock: INHERITED, stockNarrow: NONE },
    ]);
  });
});

describe("the CSS variables page", () => {
  const page = readFileSync(PAGE, "utf8");
  const documented = documentedRows(page);

  it("lists every catalog variable once, and nothing else", () => {
    const names = documented.map((row) => row.name);
    expect(names.length).toBe(new Set(names).size);
    expect(new Set(names)).toEqual(new Set(appearanceCatalog.map((entry) => entry.name)));
  });

  it("gives each variable its stock and narrow stock values", () => {
    expect(byName(documented)).toEqual(byName(catalogRows()));
  });

  it("shows the examples exactly as the screenshot spec runs them", () => {
    expect(cssFences(page)).toEqual(EXAMPLE_SNIPPETS.map((file) => readFileSync(file, "utf8")));
  });
});
