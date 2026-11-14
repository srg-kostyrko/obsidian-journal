import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initLocale } from "@/i18n";

import UiCopyableCode from "./UiCopyableCode.vue";

const writeText = vi.fn().mockResolvedValue(undefined);

// Isolated: this replaces the whole navigator for the rest of the worker, and sortablejs reads
// navigator.userAgent at import time, so under the shared registry it kills whichever later file
// imports it first.
vi.stubGlobal("navigator", {
  clipboard: { writeText },
});

beforeAll(() => initLocale("en"));

afterEach(() => {
  writeText.mockClear();
});

describe("UiCopyableCode", () => {
  it("shows the text it copies", () => {
    render(UiCopyableCode, { props: { text: "body {\n}" } });
    expect(screen.getByRole("button").textContent).toBe("body {\n}");
  });

  it("copies the text on click", async () => {
    render(UiCopyableCode, { props: { text: "body {\n}" } });
    await userEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("body {\n}");
  });

  it("copies the text on Enter", async () => {
    render(UiCopyableCode, { props: { text: "body {\n}" } });
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(writeText).toHaveBeenCalledWith("body {\n}");
  });
});
