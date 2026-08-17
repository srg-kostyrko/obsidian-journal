import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import VariableChip from "./VariableChip.vue";

const writeText = vi.fn().mockResolvedValue(undefined);

// Isolated: this replaces the whole navigator for the rest of the worker, and sortablejs reads
// navigator.userAgent at import time, so under the shared registry it kills whichever later file
// imports it first.
vi.stubGlobal("navigator", {
  clipboard: { writeText },
});

afterEach(() => {
  cleanup();
  writeText.mockClear();
});

describe("VariableChip", () => {
  it("renders the variable name wrapped in double-curly braces", () => {
    render(VariableChip, { props: { name: "date" } });
    expect(screen.getByText("{{date}}")).toBeTruthy();
  });

  it("copies the variable token to the clipboard on click", async () => {
    render(VariableChip, { props: { name: "date" } });
    await userEvent.click(screen.getByText("{{date}}"));
    expect(writeText).toHaveBeenCalledWith("{{date}}");
  });
});
