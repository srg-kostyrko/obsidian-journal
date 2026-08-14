import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import DecorationPreview from "./DecorationPreview.vue";

import type { JournalDecorationStyle } from "../config";

afterEach(() => cleanup());

describe("DecorationPreview", () => {
  it("renders the slot content", () => {
    render(DecorationPreview, { props: { styles: [] as JournalDecorationStyle[] }, slots: { default: "14" } });
    expect(screen.getByText("14")).toBeTruthy();
  });

  it("renders a corner element when a corner style is present", () => {
    const styles: JournalDecorationStyle[] = [
      { type: "corner", placement: "top-left", color: { type: "custom", color: "#ff0000" } },
    ];
    const { container } = render(DecorationPreview, { props: { styles }, slots: { default: "1" } });
    expect(container.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });
});
