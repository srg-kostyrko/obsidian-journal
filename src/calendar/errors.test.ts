import { describe, expect, it } from "vitest";

import { DateTimeError, ParseError } from "./errors";

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
