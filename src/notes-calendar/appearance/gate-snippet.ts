import { appearanceCatalog, publicName, type CatalogEntry } from "./appearance-catalog";

/** The e2e gate's view in the `e2e-appearance-snippets` fixture. */
export const GATE_VIEW_ID = "f761ecd9-f604-49c3-a157-f1a1e8b7b2fe";
/** Names the entry under test on the gate view's root; each entry gets its own rule. */
export const GATE_ATTRIBUTE = "data-appearance-gate";

/** The gate attribute's value that sets an entry's `-narrow` public name instead of its wide one. */
export const narrowGate = (entry: CatalogEntry): string => `${entry.name}:narrow`;

// One rule per entry, not one block for all: a companion pins the very variable another entry samples
// (today's color probe needs strength 1, today's strength probe samples 0.5).
function rule(entry: CatalogEntry, narrow: boolean): string {
  const companions = Object.entries(entry.probe.with ?? {});
  // At narrow a companion is set under both names: one with a stock narrow value of its own would
  // not take the wide name there.
  const declarations = [
    [publicName(entry, narrow), entry.probe.sample],
    ...companions,
    ...(narrow ? companions.map(([name, value]) => [`${name}-narrow`, value]) : []),
  ];
  return [
    `[data-journal-view="${GATE_VIEW_ID}"][${GATE_ATTRIBUTE}="${narrow ? narrowGate(entry) : entry.name}"] {`,
    ...declarations.map(([name, value]) => `  ${name}: ${value};`),
    "}",
  ].join("\n");
}

// Each entry with a stock narrow value is also set through its `-narrow` name, under its own gate value.
/** The CSS snippet the e2e gate loads: every catalog entry set to its probe sample. */
export function gateSnippet(): string {
  const header = "/* Generated from appearance-catalog.ts by `npm run gen:appearance-gate`. Do not edit. */";
  const wide = appearanceCatalog.map((entry) => rule(entry, false));
  const narrow = appearanceCatalog.filter((entry) => entry.stockNarrow !== undefined).map((entry) => rule(entry, true));
  return `${[header, ...wide, ...narrow].join("\n")}\n`;
}
