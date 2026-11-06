import type { Migration } from "@/settings";

import type { AppearanceSettingsV7, ColorSettings } from "./old-shapes";

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTransparent(color: unknown): boolean {
  return isRecord(color) && color.type === "transparent";
}

function isColor(color: unknown): color is ColorSettings {
  if (!isRecord(color)) return false;
  if (color.type === "transparent") return true;
  if (color.type === "theme") return typeof color.name === "string";
  return color.type === "custom" && typeof color.color === "string";
}

// A present but malformed color is still carried to its new place: the load repair then resets it
// and logs the field, as it would have at v7. Only an absent one is left for the slice default.
// A null text color is absent too: v8 reads null as an unreadable leaf, and v7 repaired it to the stock.
function put(target: Raw, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function migrateAppearance(old: Partial<Record<keyof AppearanceSettingsV7, unknown>>): Raw {
  const today: Raw = {};
  const active: Raw = {};
  const selected: Raw = {};
  const oldToday = isRecord(old.today) ? old.today : {};
  const oldActive = isRecord(old.active) ? old.active : {};

  if (oldToday.color !== undefined && oldToday.color !== null) today.text = { color: oldToday.color };
  put(today, "color", oldToday.background);
  if (isColor(oldToday.background) && !isTransparent(oldToday.background)) {
    today.style = "background";
    today.strength = 100;
  }

  if (oldActive.color !== undefined && oldActive.color !== null) active.text = { color: oldActive.color };
  put(active, "color", oldActive.background);
  active.style = "background";

  put(selected, "color", old.selectedRing);

  return { wide: { today, active, selected } };
}

const HEADING_DEFAULT_BLOCKS = new Set(["month-calendar", "week-calendar"]);

// Month and week blocks gained a "default" heading that follows the global; `true` was the old stock,
// so it joins the global. An explicit `false` stays, the seeded default view relies on it.
function migrateViews(views: unknown): void {
  if (!isRecord(views)) return;
  for (const view of Object.values(views)) {
    if (!isRecord(view) || !Array.isArray(view.blocks)) continue;
    for (const block of view.blocks) {
      if (!isRecord(block) || typeof block.key !== "string" || !HEADING_DEFAULT_BLOCKS.has(block.key)) continue;
      if (isRecord(block.config) && block.config.showHeading === true) block.config.showHeading = "default";
    }
  }
}

export const v7ToV8Migration: Migration = {
  fromVersion: 7,
  toVersion: 8,
  migrate(raw) {
    if (isRecord(raw.appearance)) raw.appearance = migrateAppearance(raw.appearance);
    migrateViews(raw.views);
    return raw;
  },
};
