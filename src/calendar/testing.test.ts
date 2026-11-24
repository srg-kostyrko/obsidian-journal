import { moment } from "obsidian";
import { describe, expect, it } from "vitest";

import { AsyncResult } from "@/infrastructure/result";

import { CUSTOM_LOCALE } from "./calendar";
import { date, installTestCalendar, restoreEras, testCalendar, withoutEras } from "./testing";
import { userDateFormat } from "./user-date-format";

describe("ambient test calendar", () => {
  it("starts every test on the Monday/ISO grid without an explicit install", () => {
    expect(moment.localeData(CUSTOM_LOCALE).firstDayOfWeek()).toBe(1);
  });

  it("lets a test replace the ambient grid", () => {
    installTestCalendar({ dow: 0, doy: 6 });

    expect(moment.localeData(CUSTOM_LOCALE).firstDayOfWeek()).toBe(0);
  });

  it("restores the ambient grid for the next test", () => {
    expect(moment.localeData(CUSTOM_LOCALE).firstDayOfWeek()).toBe(1);
  });

  it("returns the same calendar instance a replacement installed", () => {
    const { calendar } = installTestCalendar({ dow: 0, doy: 6 });

    expect(testCalendar()).toBe(calendar);
  });
});

function formatsEraYear(): boolean {
  return date("2026-11-24").tryFormat(userDateFormat("y")).isOk();
}

describe("withoutEras", () => {
  it("restores the eras before anything chained on a returned AsyncResult runs", async () => {
    let inside: boolean | undefined;

    const seenAfter = await withoutEras(() =>
      AsyncResult.fromPromise(
        new Promise<void>((resolve) => window.setTimeout(resolve, 0)).then(() => {
          inside = formatsEraYear();
        }),
        () => "never",
      ),
    ).map(() => formatsEraYear());

    expect(inside).toBe(false);
    expect(seenAfter.isOk() && seenAfter.value).toBe(true);
  });

  it("restores the eras before a caller awaiting a promise resumes", async () => {
    await withoutEras(() => new Promise<void>((resolve) => window.setTimeout(resolve, 0)));

    expect(formatsEraYear()).toBe(true);
  });

  it("puts back eras a run that never settles still holds", () => {
    void withoutEras(() => new Promise<never>(() => undefined));
    expect(formatsEraYear()).toBe(false);

    restoreEras();

    expect(formatsEraYear()).toBe(true);
  });
});
