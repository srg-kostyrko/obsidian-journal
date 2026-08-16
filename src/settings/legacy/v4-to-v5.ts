import type { Migration } from "@/settings";

interface OldBlock {
  rows?: unknown[];
  [key: string]: unknown;
}

function toLines(block: OldBlock): Record<string, unknown> {
  const { rows, ...rest } = block;
  // A block with no `rows` but an existing `lines` array is already v5-shaped (a hand-authored
  // fixture staged ahead of a version bump, or a future migration run twice); rebuilding `lines`
  // from a missing `rows` would silently wipe it back to empty.
  if (!Array.isArray(rows)) return "lines" in rest ? rest : { ...rest, lines: [] };
  return { ...rest, lines: rows.map((row) => [{ ...(row as Record<string, unknown>), linkDate: "" }]) };
}

export const v4ToV5Migration: Migration = {
  fromVersion: 4,
  toVersion: 5,
  migrate(raw) {
    const journals = (raw.journals ?? {}) as Record<string, Record<string, unknown>>;
    for (const journal of Object.values(journals)) {
      if (!journal || typeof journal !== "object") continue;
      for (const field of ["navBlock", "intervalBlock"] as const) {
        const block = journal[field];
        if (block && typeof block === "object") journal[field] = toLines(block as OldBlock);
      }
    }
    return raw;
  },
};
