import type { ViewId } from "./config";

// A public surface: CSS snippets target one view through this attribute on its root.
export const VIEW_ID_ATTRIBUTE = "data-journal-view";

export function viewSelector(id: ViewId): string {
  return `[${VIEW_ID_ATTRIBUTE}="${id}"]`;
}
