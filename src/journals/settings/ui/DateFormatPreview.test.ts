import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

import DateFormatPreview from "./DateFormatPreview.vue";

describe("DateFormatPreview", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("renders today's date formatted with the given pattern", () => {
    render(DateFormatPreview, { props: { format: "YYYY" } });
    expect(screen.getByText(/^\d{4}$/)).toBeTruthy();
  });

  it("renders custom delimiters in the pattern", () => {
    render(DateFormatPreview, { props: { format: "YYYY/MM" } });
    expect(screen.getByText(/^\d{4}\/\d{2}$/)).toBeTruthy();
  });

  it("warns when the pattern uses the ISO week token W", () => {
    render(DateFormatPreview, { props: { format: "GGGG-[W]WW" } });
    expect(screen.getByText(/does not respect custom week settings/)).toBeTruthy();
  });

  it("does not warn when the pattern uses the locale week token w", () => {
    render(DateFormatPreview, { props: { format: "GGGG-[W]ww" } });
    expect(screen.queryByText(/does not respect custom week settings/)).toBeNull();
  });
});
