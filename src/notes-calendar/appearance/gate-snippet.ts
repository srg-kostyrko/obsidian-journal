import { appearanceCatalog, publicName, type CatalogEntry } from "./appearance-catalog";

/** The e2e gate's view in the `e2e-appearance-snippets` fixture. */
export const GATE_VIEW_ID = "f761ecd9-f604-49c3-a157-f1a1e8b7b2fe";
/** Names the entry under test on the gate view's root; each entry gets its own rule. */
export const GATE_ATTRIBUTE = "data-appearance-gate";

// One rule per entry, not one block for all: a companion pins the very variable another entry samples
// (today's color probe needs strength 100%, today's strength probe samples 50%).
function rule(entry: CatalogEntry): string {
  const declarations = [[publicName(entry), entry.probe.sample], ...Object.entries(entry.probe.with ?? {})];
  return [
    `[data-journal-view="${GATE_VIEW_ID}"][${GATE_ATTRIBUTE}="${entry.name}"] {`,
    ...declarations.map(([name, value]) => `  ${name}: ${value};`),
    "}",
  ].join("\n");
}

/** The CSS snippet the e2e gate loads: every catalog entry set to its probe sample. */
export function gateSnippet(): string {
  const header = "/* Generated from appearance-catalog.ts by `npm run gen:appearance-gate`. Do not edit. */";
  return `${[header, ...appearanceCatalog.map(rule)].join("\n")}\n`;
}
