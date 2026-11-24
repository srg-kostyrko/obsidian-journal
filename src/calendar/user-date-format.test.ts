import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { CalendarDate } from "./calendar-date";
import { Clock } from "./clock";
import { DateFormatError, ParseError } from "./errors";
import { periodOfKind } from "./period";
import { date, withoutEras } from "./testing";
import { userDateFormat, userDateFormatSchema } from "./user-date-format";

describe("tryFormat", () => {
  it("returns the rendered string for a valid user pattern", () => {
    const result = CalendarDate.fromAnchor("2026-11-24" as never).tryFormat(userDateFormat("YYYY-MM-DD"));

    expectOk(result);
    expect(result.value).toBe("2026-11-24");
  });

  it("returns DateFormatError when moment throws", () => {
    withoutEras(() => {
      const result = date("2026-11-24").tryFormat(userDateFormat("YYYYy-[W]w"));
      expectErr(result);
      const error = result.error;

      expect(error).toBeInstanceOf(DateFormatError);
      expect(error.pattern).toBe("YYYYy-[W]w");
      expect(error.reason).toContain("length");
    });
  });

  it("returns DateFormatError from a Clock when moment throws", () => {
    withoutEras(() => {
      const result = Clock.now().tryFormat(userDateFormat("YYYYy-[W]w"));
      expectErr(result);
      const error = result.error;

      expect(error).toBeInstanceOf(DateFormatError);
      expect(error.reason).toContain("length");
    });
  });

  it("returns DateFormatError from a period when moment throws", () => {
    withoutEras(() => {
      const result = periodOfKind("week", date("2026-11-24")).tryFormat(userDateFormat("YYYYy-[W]w"));
      expectErr(result);
      const error = result.error;

      expect(error).toBeInstanceOf(DateFormatError);
      expect(error.pattern).toBe("YYYYy-[W]w");
    });
  });
});

describe("withoutEras", () => {
  it("restores era data afterwards", () => {
    withoutEras(() => undefined);

    expectOk(date("2026-11-24").tryFormat(userDateFormat("YYYYy")));
  });
});

describe("parse", () => {
  it("returns ParseError when moment throws", () => {
    withoutEras(() => {
      const result = CalendarDate.parse("CE 2026", "N y");

      expectErr(result);
      expect(result.error).toBeInstanceOf(ParseError);
    });
  });
});

describe("userDateFormatSchema", () => {
  it("passes a string through as a UserDateFormat", () => {
    expect(v.parse(userDateFormatSchema, "YYYY")).toBe("YYYY");
  });
});

describe("format typing", () => {
  it("accepts plain strings and rejects a UserDateFormat", () => {
    const d = date("2026-11-24");
    const plain = ["YYYY"].join("");

    expect(d.format("YYYY")).toBe("2026");
    expect(d.format(plain)).toBe("2026");
    // @ts-expect-error a user-entered pattern must go through tryFormat
    d.format(userDateFormat("YYYY"));
    // @ts-expect-error same for a period
    periodOfKind("day", d).format(userDateFormat("YYYY"));
    // @ts-expect-error same for a clock
    Clock.now().format(userDateFormat("YYYY"));
  });
});
