import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { CalendarDate, userDateFormat } from "@/calendar";
import { withoutEras } from "@/calendar/testing";
import { m } from "@/i18n";

import DateFormatPreview from "./DateFormatPreview.vue";

describe("DateFormatPreview", () => {
  it("renders today's date formatted with the given pattern", () => {
    render(DateFormatPreview, { props: { format: userDateFormat("YYYY") } });
    expect(screen.getByText(/^\d{4}$/)).toBeTruthy();
  });

  it("renders custom delimiters in the pattern", () => {
    render(DateFormatPreview, { props: { format: userDateFormat("YYYY/MM") } });
    expect(screen.getByText(/^\d{4}\/\d{2}$/)).toBeTruthy();
  });

  it("warns when the pattern uses the ISO week token W", () => {
    render(DateFormatPreview, { props: { format: userDateFormat("GGGG-[W]WW") } });
    expect(screen.getByText(/does not respect custom week settings/)).toBeTruthy();
  });

  it("does not warn when the pattern uses the locale week token w", () => {
    render(DateFormatPreview, { props: { format: userDateFormat("GGGG-[W]ww") } });
    expect(screen.queryByText(/does not respect custom week settings/)).toBeNull();
  });

  it("shows the invalid-format message when the pattern throws, and the sample again once it is fixed", async () => {
    await withoutEras(async () => {
      const broken = userDateFormat("YYYYy");
      const failure = CalendarDate.today().tryFormat(broken);
      if (failure.isOk()) throw new Error("expected the pattern to throw without eras");
      const message = m.date_format_invalid_preview({ reason: failure.error.reason });
      const view = render(DateFormatPreview, { props: { format: broken } });
      expect(screen.getByText(message)).toBeTruthy();

      await view.rerender({ format: userDateFormat("YYYY") });

      expect(screen.getByText(/^\d{4}$/)).toBeTruthy();
      expect(screen.queryByText(message)).toBeNull();
    });
  });
});
