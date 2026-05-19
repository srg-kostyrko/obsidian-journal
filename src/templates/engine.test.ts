import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { Ok } from "@/infrastructure/result";

import { buildFakeContext, FakeHandler, installTestEngine } from "./testing";

describe("TemplateEngine.renderString", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("renders literal-only templates unchanged", () => {
    const engine = installTestEngine();
    expect(engine.renderString("just literal", buildFakeContext())).toBe("just literal");
  });

  it("renders a string variable", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Journal: {{journal_name}}", buildFakeContext())).toBe("Journal: Daily");
  });

  it("renders a number variable", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Sprint {{index}}", buildFakeContext())).toBe("Sprint 7");
  });

  it("renders a date variable with default format", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Today: {{date}}", buildFakeContext())).toBe("Today: 2022-01-05");
  });

  it("renders a date variable with format override", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Today: {{date:MMM D, YYYY}}", buildFakeContext())).toBe("Today: Jan 5, 2022");
  });

  it.each([
    ["{{date+1d}}", "2022-01-06"],
    ["{{date-1d}}", "2022-01-04"],
    ["{{date+1w}}", "2022-01-12"],
    ["{{date+1m}}", "2022-02-05"],
    ["{{date+1q}}", "2022-04-05"],
    ["{{date+1y}}", "2023-01-05"],
  ])("renders %s with arithmetic", (template, expected) => {
    const engine = installTestEngine();
    expect(engine.renderString(template, buildFakeContext())).toBe(expected);
  });

  it.each([
    ["{{date<startOf=week>}}", "2022-01-03"],
    ["{{date<endOf=week>}}", "2022-01-09"],
    ["{{date<startOf=month>}}", "2022-01-01"],
    ["{{date<endOf=month>}}", "2022-01-31"],
    ["{{date<startOf=quarter>}}", "2022-01-01"],
    ["{{date<endOf=quarter>}}", "2022-03-31"],
    ["{{date<startOf=decade>}}", "2020-01-01"],
    ["{{date<endOf=decade>}}", "2029-12-31"],
  ])("renders %s with boundary modifier", (template, expected) => {
    const engine = installTestEngine();
    expect(engine.renderString(template, buildFakeContext())).toBe(expected);
  });

  describe("v2 pass-through fidelity", () => {
    it("passes through unknown variable name verbatim", () => {
      const engine = installTestEngine();
      expect(engine.renderString("hello {{not_a_var}}", buildFakeContext())).toBe("hello {{not_a_var}}");
    });

    it("passes through function token when no handler registered", () => {
      const engine = installTestEngine();
      expect(engine.renderString("link: {{journal_link(Other)}}", buildFakeContext())).toBe(
        "link: {{journal_link(Other)}}",
      );
    });

    it("ignores format slot on string variables", () => {
      const engine = installTestEngine();
      expect(engine.renderString("{{journal_name:YYYY}}", buildFakeContext())).toBe("{{journal_name:YYYY}}");
    });
  });

  describe("function dispatch", () => {
    it("invokes a registered handler", () => {
      const engine = installTestEngine([FakeHandler.fixed("greet", "hi")]);
      expect(engine.renderString("{{greet(world)}}", buildFakeContext())).toBe("hi");
    });

    it("passes the modifier-shifted source date to handler", () => {
      const handler = new FakeHandler("show_date", (input) => new Ok(input.sourceDate.toAnchor()));
      const engine = installTestEngine([handler]);
      expect(engine.renderString("{{show_date(x)+1w}}", buildFakeContext())).toBe("2022-01-12");
    });
  });
});
