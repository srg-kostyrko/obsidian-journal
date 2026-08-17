import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initLocale } from "@/i18n";

import CodeBlockSnippet from "./CodeBlockSnippet.vue";

const writeText = vi.fn().mockResolvedValue(undefined);

// Isolated: this replaces the whole navigator for the rest of the worker, and sortablejs reads
// navigator.userAgent at import time, so under the shared registry it kills whichever later file
// imports it first.
vi.stubGlobal("navigator", {
  clipboard: { writeText },
});

beforeAll(() => initLocale("en"));

afterEach(() => {
  cleanup();
  writeText.mockClear();
});

describe("CodeBlockSnippet", () => {
  it("renders the fenced block name", () => {
    render(CodeBlockSnippet, { props: { name: "journal-nav" } });
    expect(screen.getByText(/journal-nav/)).toBeTruthy();
  });

  it("copies the bare fence for a name-only snippet", async () => {
    render(CodeBlockSnippet, { props: { name: "journal-nav" } });
    await userEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("```journal-nav\n```");
  });

  it("includes the body inside the copied fence", async () => {
    render(CodeBlockSnippet, { props: { name: "calendar-timeline", body: "mode: month" } });
    await userEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("```calendar-timeline\nmode: month\n```");
  });
});
