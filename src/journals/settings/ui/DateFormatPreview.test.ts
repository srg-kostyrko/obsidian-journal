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
});
