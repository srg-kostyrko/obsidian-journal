import { m } from "@/i18n";

import { markerProblem } from "./marker";

export function normalizeMarker(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function markerErrors(normalized: string): string[] {
  const problem = markerProblem(normalized);
  if (problem === "required") return [m.tasks_checkbox_marker_required()];
  if (problem === "invalid") return [m.tasks_checkbox_marker_invalid()];
  return [];
}
