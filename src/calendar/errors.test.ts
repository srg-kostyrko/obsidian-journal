import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DateTimeError, IntervalError, ParseError } from "./errors";
import { date, installTestCalendar } from "./testing";

describe("ParseError", () => {
  it("formats the message without a format hint when none is given", () => {
    const error = new ParseError("not-a-date");

    expect(error.message).toBe('Cannot parse "not-a-date"');
  });

  it("formats the message with the format hint when given", () => {
    const error = new ParseError("oops", "YYYY-MM-DD");

    expect(error.message).toBe('Cannot parse "oops" with format "YYYY-MM-DD"');
  });

  it("exposes the original input on the instance", () => {
    const error = new ParseError("oops", "YYYY-MM-DD");

    expect(error.input).toBe("oops");
    expect(error.format).toBe("YYYY-MM-DD");
  });
});

describe("DateTimeError", () => {
  it("sets the name to DateTimeError", () => {
    const error = new DateTimeError("boom");

    expect(error.name).toBe("DateTimeError");
  });
});

describe("IntervalError", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("formats the message with both anchor strings", () => {
    const error = new IntervalError(date("2025-03-15"), date("2025-03-14"));

    expect(error.message).toBe("Interval start 2025-03-15 is after end 2025-03-14");
  });

  it("exposes start on the instance", () => {
    const error = new IntervalError(date("2025-03-15"), date("2025-03-14"));

    expect(error.start.toAnchor()).toBe("2025-03-15");
  });

  it("exposes end on the instance", () => {
    const error = new IntervalError(date("2025-03-15"), date("2025-03-14"));

    expect(error.end.toAnchor()).toBe("2025-03-14");
  });
});
