import { render, screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";

import DecorationPreview from "./DecorationPreview.vue";

import type { JournalDecorationStyle } from "../config";

beforeAll(() => initLocale("en"));

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

  it("draws every authored mark when no limit is given", () => {
    const styles: JournalDecorationStyle[] = Array.from({ length: 5 }, () => ({
      type: "shape",
      size: 0.4,
      shape: "circle",
      color: { type: "custom", color: "#ff0000" },
      placement_x: "right",
      placement_y: "top",
    }));

    const { container } = render(DecorationPreview, { props: { styles }, slots: { default: "1" } });

    expect(container.querySelectorAll(".shape-decoration")).toHaveLength(5);
  });

  it("truncates to the given limit so it matches the grid it explains", () => {
    const styles: JournalDecorationStyle[] = Array.from({ length: 5 }, () => ({
      type: "shape",
      size: 0.4,
      shape: "circle",
      color: { type: "custom", color: "#ff0000" },
      placement_x: "right",
      placement_y: "top",
    }));

    const { container } = render(DecorationPreview, { props: { styles, limit: 3 }, slots: { default: "1" } });

    expect(container.querySelectorAll(".place-right_top .shape-decoration")).toHaveLength(2);
  });
});
