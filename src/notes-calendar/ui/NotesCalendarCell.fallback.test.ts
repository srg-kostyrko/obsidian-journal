import { describe, expect, it } from "vitest";

import cellSource from "./NotesCalendarCell.vue?raw";

describe("NotesCalendarCell stock colors", () => {
  it.each([
    "var(--journal-cell-today-color, var(--journal-saved-cell-today-color, var(--text-accent)))",
    "var(--journal-cell-today-bg, var(--journal-saved-cell-today-bg, transparent))",
    "var(--journal-cell-active-color, var(--journal-saved-cell-active-color, var(--text-on-accent)))",
    "var(--journal-cell-active-bg, var(--journal-saved-cell-active-bg, var(--interactive-accent)))",
    "var(--journal-cell-selected-ring, var(--journal-saved-cell-selected-ring, var(--interactive-accent)))",
  ])("falls back to the stock value with no variables set: %s", (declaration) => {
    expect(cellSource).toContain(declaration);
  });
});
