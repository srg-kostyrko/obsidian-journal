import { compileStyle, parse } from "vue/compiler-sfc";

import { publicName, savedName, type CatalogEntry } from "./appearance/appearance-catalog";
import previewSource from "./appearance/ui/AppearancePreview.vue?raw";
import bandSource from "./ui/NotesCalendarBand.vue?raw";
import cellSource from "./ui/NotesCalendarCell.vue?raw";
import dividerSource from "./ui/NotesCalendarDivider.vue?raw";
import monthViewSource from "./ui/NotesMonthView.vue?raw";
import weekViewSource from "./ui/NotesWeekView.vue?raw";

/** The container query every narrow value sits under. */
export const NARROW_QUERY = "journal-calendar (max-width: 28em)";

export interface ScopedRule {
  /** The selector with the scope attribute stripped, so it reads as written in the SFC. */
  readonly selector: string;
  /** The `@container` params the rule sits under, or null outside any container query. */
  readonly container: string | null;
  readonly declarations: ReadonlyMap<string, string>;
}

/** The SFC's `<style scoped>` blocks compiled as Vite compiles them, flattened into rules. */
export function scopedStyleRules(source: string): readonly ScopedRule[] {
  const { descriptor } = parse(source);
  const rules: ScopedRule[] = [];
  for (const style of descriptor.styles) {
    const compiled = compileStyle({ source: style.content, filename: "component.vue", id: "data-v-t", scoped: true });
    if (compiled.errors.length > 0) throw new Error(compiled.errors.map(String).join("\n"));
    compiled.rawResult?.root.walkRules((rule) => {
      const parent = rule.parent;
      const container = parent && "params" in parent && parent.name === "container" ? parent.params : null;
      const declarations = new Map<string, string>();
      rule.walkDecls((declaration) => {
        declarations.set(
          declaration.prop,
          declaration.value.replaceAll(/\s+/g, " ").replaceAll(/\(\s/g, "(").replaceAll(/\s\)/g, ")").trim(),
        );
      });
      rules.push({ selector: rule.selector.replaceAll("[data-v-t]", ""), container, declarations });
    });
  }
  return rules;
}

/** The scoped rules of every component that reads the appearance catalog. */
export function calendarStyleRules(): Record<
  "cell" | "band" | "divider" | "monthView" | "weekView" | "preview",
  readonly ScopedRule[]
> {
  return {
    cell: scopedStyleRules(cellSource),
    band: scopedStyleRules(bandSource),
    divider: scopedStyleRules(dividerSource),
    monthView: scopedStyleRules(monthViewSource),
    weekView: scopedStyleRules(weekViewSource),
    preview: scopedStyleRules(previewSource),
  };
}

/** The private property a component resolves a catalog value into, e.g. `--_v-weekday-size`. */
export function privateName(entry: CatalogEntry): `--${string}` {
  return `--_v-${entry.name.replace(/^journal-cell-/, "")}`;
}

/** `var(public, var(saved, stock))`, with the stock left out when the catalog's is empty. */
export function wideReader(entry: CatalogEntry): string {
  const stock = entry.stock === "" ? "" : `, ${entry.stock}`;
  return `var(${publicName(entry)}, var(${savedName(entry)}${stock}))`;
}

/** The narrow pair ahead of the stock narrow value, or ahead of the whole wide chain without one. */
export function narrowReader(entry: CatalogEntry): string {
  return `var(${publicName(entry, true)}, var(${savedName(entry, true)}, ${entry.stockNarrow ?? wideReader(entry)}))`;
}
