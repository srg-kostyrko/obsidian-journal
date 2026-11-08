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

/** Rows of every table whose first cell is a `--journal-…` name: Variable | Changes | Stock | Narrow stock. */
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

describe("documentedRows", () => {
  it("reads name, stock and narrow stock, ignoring the description", () => {
    const page = [
      "| Variable | Changes | Stock | Narrow stock |",
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
  const documented = documentedRows(readFileSync(PAGE, "utf8"));

  it("lists every catalog variable once, and nothing else", () => {
    const names = documented.map((row) => row.name);
    expect(names.length).toBe(new Set(names).size);
    expect(new Set(names)).toEqual(new Set(appearanceCatalog.map((entry) => entry.name)));
  });

  it("gives each variable its stock and narrow stock values", () => {
    expect(byName(documented)).toEqual(byName(catalogRows()));
  });
});
