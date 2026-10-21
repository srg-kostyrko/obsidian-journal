import { m } from "@/i18n";

// Rolled detection reads the tags metadataCache parsed, so a marker Obsidian does not parse as a tag
// would be stamped and never read back, and the line would roll again on every run.
const TAG_BODY = /^[\p{L}\p{N}_\-/]+$/u;
const ALL_DIGITS = /^\p{N}+$/u;

export function normalizeMarker(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function markerErrors(normalized: string): string[] {
  const body = normalized.slice(1);
  if (body === "") return [m.tasks_checkbox_marker_required()];
  if (!TAG_BODY.test(body) || ALL_DIGITS.test(body)) return [m.tasks_checkbox_marker_invalid()];
  return [];
}
