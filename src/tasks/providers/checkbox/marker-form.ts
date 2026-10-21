import { m } from "@/i18n";

export function normalizeMarker(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

// The marker is appended to a line as a tag, so anything a tag cannot hold would never read back.
export function markerErrors(normalized: string): string[] {
  if (normalized === "" || normalized === "#") return [m.tasks_checkbox_marker_required()];
  if (/\s/u.test(normalized)) return [m.tasks_checkbox_marker_spaces()];
  return [];
}
