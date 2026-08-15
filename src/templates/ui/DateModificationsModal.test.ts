import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import DateModificationsModal from "./DateModificationsModal.vue";

afterEach(() => cleanup());

describe("DateModificationsModal", () => {
  it("renders the format-override example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date:YYYY}}")).toBeTruthy();
  });

  it("renders the shift example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date+1w}}")).toBeTruthy();
  });

  it("renders the boundary example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date<startOf=year>}}")).toBeTruthy();
  });

  it("renders the combined example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date+1w<startOf=week>:MMM DD, YYYY}}")).toBeTruthy();
  });

  it("renders the number example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{index+3:o}}")).toBeTruthy();
  });

  it("lists every shift unit", () => {
    render(DateModificationsModal);
    for (const unit of ["d", "w", "m", "q", "y", "h"]) {
      expect(screen.getByText(new RegExp(`^${unit} — `))).toBeTruthy();
    }
  });

  it("lists every boundary unit", () => {
    render(DateModificationsModal);
    for (const unit of ["day", "week", "month", "quarter", "year", "decade", "hour"]) {
      expect(screen.getByText(new RegExp(`^${unit}`))).toBeTruthy();
    }
  });
});
