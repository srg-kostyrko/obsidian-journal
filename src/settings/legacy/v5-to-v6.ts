import type { Migration } from "@/settings";

// A block stored before 3.4.0 has no showAdjacent at all, and showed the adjacent periods.
function toDevices(showAdjacent: unknown): unknown {
  if (showAdjacent === undefined || showAdjacent === true) return "all";
  if (showAdjacent === false) return "none";
  return showAdjacent;
}

export const v5ToV6Migration: Migration = {
  fromVersion: 5,
  toVersion: 6,
  migrate(raw) {
    const journals = (raw.journals ?? {}) as Record<string, Record<string, unknown>>;
    for (const journal of Object.values(journals)) {
      if (!journal || typeof journal !== "object") continue;
      for (const field of ["navBlock", "intervalBlock"] as const) {
        const block = journal[field] as Record<string, unknown> | undefined;
        if (block && typeof block === "object") block.showAdjacent = toDevices(block.showAdjacent);
      }
    }
    return raw;
  },
};
