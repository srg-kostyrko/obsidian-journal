import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, Clock, type AnchorString } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { Ok } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { TemplateContext } from "./context";
import { tokenize } from "./grammar";
import { applyModifiers } from "./modifiers";
import { buildFakeContext, FakeHandler, installTestEngine } from "./testing";

import type { BoundValue } from "./types";

function asDateBinding(bound: BoundValue | undefined): CalendarDate {
  if (bound?.kind !== "date") throw new Error("expected date binding");
  return bound.value;
}

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

    it("passes the source date without applying modifiers to handler", () => {
      const handler = new FakeHandler("show_date", (input) => new Ok(input.sourceDate.toAnchor()));
      const engine = installTestEngine([handler]);
      expect(engine.renderString("{{show_date(x)+1w}}", buildFakeContext())).toBe("2022-01-05");
    });

    it("passes the raw modifiers to handler", () => {
      const handler = new FakeHandler(
        "show_shift",
        (input) => new Ok(applyModifiers(input.sourceDate, input.modifiers).toAnchor()),
      );
      const engine = installTestEngine([handler]);
      expect(engine.renderString("{{show_shift(x)+1w}}", buildFakeContext())).toBe("2022-01-12");
    });
  });
});

describe("TemplateEngine.parse", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("parses a single date variable from a path", () => {
    const engine = installTestEngine();
    const context = buildFakeContext();
    const result = engine.parse(tokenize("{{date:YYYY-MM-DD}}.md"), "2022-01-05.md", context);
    expectOk(result);
    expect(asDateBinding(result.value.get("date")).toAnchor()).toBe("2022-01-05");
  });

  it("un-applies modifiers during parse", () => {
    const engine = installTestEngine();
    const context = buildFakeContext();
    const result = engine.parse(tokenize("{{date+1w:YYYY-MM-DD}}.md"), "2022-01-12.md", context);
    expectOk(result);
    expect(asDateBinding(result.value.get("date")).toAnchor()).toBe("2022-01-05");
  });

  it("parses index and date from a multi-variable name", () => {
    const engine = installTestEngine();
    const context = buildFakeContext();
    const stream = tokenize("Sprint {{index}} - {{date:YYYY-MM-DD}}.md");
    const result = engine.parse(stream, "Sprint 7 - 2022-01-05.md", context);
    expectOk(result);
    expect(result.value.get("index")).toEqual({ kind: "number", value: 7 });
    expect(asDateBinding(result.value.get("date")).toAnchor()).toBe("2022-01-05");
  });

  it("matches a string variable against its bound literal", () => {
    const engine = installTestEngine();
    const context = buildFakeContext();
    const result = engine.parse(tokenize("{{journal_name}} {{index}}.md"), "Daily 1.md", context);
    expectOk(result);
    expect(result.value.get("index")).toEqual({ kind: "number", value: 1 });
  });

  it("returns no-match when a string variable's text differs from its bound literal", () => {
    const engine = installTestEngine();
    const context = buildFakeContext();
    const result = engine.parse(tokenize("{{journal_name}} {{index}}.md"), "Other 1.md", context);
    expectErr(result);
    expect(result.error.detail.kind).toBe("no-match");
  });

  it("treats current_date as a wildcard (no capture)", () => {
    const engine = installTestEngine();
    const context = buildFakeContext().date(
      "current_date",
      CalendarDate.fromAnchor(anchor("2022-01-05")),
      "YYYY-MM-DD",
      { invertible: false },
    );
    const stream = tokenize("{{date:YYYY-MM-DD}}-{{current_date:YYYY-MM-DD}}.md");
    const result = engine.parse(stream, "2022-01-05-anything-here.md", context);
    expectOk(result);
    expect(result.value.has("current_date")).toBe(false);
  });

  it("returns no-match when literal text does not match", () => {
    const engine = installTestEngine();
    const result = engine.parse(tokenize("prefix-{{date:YYYY-MM-DD}}.md"), "other-2022-01-05.md", buildFakeContext());
    expectErr(result);
    expect(result.error.detail.kind).toBe("no-match");
  });

  it("matches a pure-literal template with no variable tokens", () => {
    // A stream with no variables compiles to a regex with no named groups, so
    // `.groups` is undefined on the match object even though it matched — parse
    // must not mistake that for a failed match (a plain folder name like "Diary").
    const engine = installTestEngine();
    const result = engine.parse(tokenize("Diary"), "Diary", buildFakeContext());
    expectOk(result);
    expect(result.value.size).toBe(0);
  });

  it("returns invalid-date when capture cannot be parsed strictly", () => {
    const engine = installTestEngine();
    const context = buildFakeContext();
    const result = engine.parse(tokenize("{{date:YYYY-MM-DD}}.md"), "9999-99-99.md", context);
    expectErr(result);
    expect(["invalid-date", "no-match"]).toContain(result.error.detail.kind);
  });

  it("returns not-invertible for templates containing function tokens", () => {
    const engine = installTestEngine([FakeHandler.fixed("greet", "x")]);
    const result = engine.parse(tokenize("{{greet(arg)}}.md"), "x.md", buildFakeContext());
    expectErr(result);
    expect(result.error.detail.kind).toBe("not-invertible");
  });

  it("returns not-invertible for unknown variables", () => {
    const engine = installTestEngine();
    const context = TemplateContext.empty();
    const result = engine.parse(tokenize("{{date:YYYY-MM-DD}}.md"), "2022-01-05.md", context);
    expectErr(result);
    expect(result.error.detail.kind).toBe("not-invertible");
  });

  describe("multi-binding resolution", () => {
    it("resolves consistent boundary captures to start-of-range source", () => {
      const engine = installTestEngine();
      const context = buildFakeContext();
      const stream = tokenize("{{date<startOf=week>:YYYY-MM-DD}}-{{date<endOf=week>:YYYY-MM-DD}}.md");
      const result = engine.parse(stream, "2022-01-03-2022-01-09.md", context);
      expectOk(result);
      expect(asDateBinding(result.value.get("date")).toAnchor()).toBe("2022-01-03");
    });

    it("returns conflict for inconsistent captures of same variable", () => {
      const engine = installTestEngine();
      const context = buildFakeContext();
      const stream = tokenize("{{date:YYYY-MM-DD}}-{{date:YYYY-MM-DD}}.md");
      const result = engine.parse(stream, "2022-01-05-2022-02-10.md", context);
      expectErr(result);
      expect(result.error.detail.kind).toBe("conflict");
    });
  });
});

describe("TemplateEngine.validate", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns empty problems for valid template", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{date:YYYY-MM-DD}}.md");
    expect(engine.validate(stream, buildFakeContext())).toEqual([]);
  });

  it("flags unknown variable", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{not_a_var}}.md");
    const problems = engine.validate(stream, buildFakeContext());
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toBe("unknown-variable");
  });

  it("flags a boundary unit it does not understand", () => {
    // An unrecognized unit is dropped at render (applyModifier returns the value untouched), so
    // the date silently comes out unsnapped. validate declared this problem and never emitted it,
    // which left the settings preview with nothing to report.
    const engine = installTestEngine();
    const stream = tokenize("{{date<startOf=fortnight>:YYYY-MM-DD}}.md");
    const problems = engine.validate(stream, buildFakeContext());
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toBe("unknown-unit");
  });

  it("accepts every boundary unit the reference documents", () => {
    const engine = installTestEngine();
    for (const unit of ["day", "week", "month", "quarter", "year", "decade", "hour"]) {
      const stream = tokenize(`{{date<startOf=${unit}>:YYYY-MM-DD}}.md`);
      expect(engine.validate(stream, buildFakeContext())).toEqual([]);
    }
  });

  it("flags function token when allowFunctions is false", () => {
    const engine = installTestEngine([FakeHandler.fixed("greet", "x")]);
    const stream = tokenize("{{greet(x)}}.md");
    const problems = engine.validate(stream, buildFakeContext(), { allowFunctions: false });
    expect(problems[0].problem).toBe("function-not-allowed");
  });

  it("flags unknown function when handler missing", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{nope(x)}}.md");
    const problems = engine.validate(stream, buildFakeContext(), { allowFunctions: true });
    expect(problems[0].problem).toBe("unknown-function");
  });

  it("flags format on non-date variable", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{journal_name:YYYY}}");
    const problems = engine.validate(stream, buildFakeContext());
    expect(problems.some((problem) => problem.problem === "format-on-non-date")).toBe(true);
  });

  it("flags modifiers on non-date variable", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{index+1d}}");
    const problems = engine.validate(stream, buildFakeContext());
    expect(problems.some((problem) => problem.problem === "modifiers-on-non-date")).toBe(true);
  });
});

describe("v2 parity", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("renders v2 daily anchor in default format", () => {
    const engine = installTestEngine();
    expect(engine.renderString("{{date}}", buildFakeContext())).toBe("2022-01-05");
  });

  it("renders v2 daily anchor with format override", () => {
    const engine = installTestEngine();
    expect(engine.renderString("{{date:MMM D, YYYY}}", buildFakeContext())).toBe("Jan 5, 2022");
  });

  it("renders v2 daily nameTemplate with index plus date", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Sprint {{index}} — {{date:YYYY-MM-DD}}", buildFakeContext())).toBe(
      "Sprint 7 — 2022-01-05",
    );
  });

  it("renders v2 weekly anchor with ISO-week format", () => {
    const engine = installTestEngine();
    const context = TemplateContext.empty()
      .date("date", CalendarDate.fromAnchor(anchor("2022-01-05")), "YYYY-[W]w")
      .date("start_date", CalendarDate.fromAnchor(anchor("2022-01-03")), "YYYY-MM-DD")
      .date("end_date", CalendarDate.fromAnchor(anchor("2022-01-09")), "YYYY-MM-DD")
      .string("journal_name", "Weekly")
      .number("index", 1);
    expect(engine.renderString("{{date}}", context)).toBe("2022-W1");
  });
});

describe("renders clock variables", () => {
  let engine: ReturnType<typeof installTestEngine>;
  beforeEach(() => {
    vi.useFakeTimers();
    engine = installTestEngine();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with default format", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    expect(engine.renderString("now is {{time}}", context)).toBe("now is 10:37");
  });

  it("renders with format override", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    expect(engine.renderString("{{time:HH:mm:ss}}", context)).toBe("10:37:42");
  });

  it("applies modifiers and format", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    expect(engine.renderString("{{time-1h:HH:mm}}", context)).toBe("09:37");
  });
});

describe("non-invertible date and clock variables in parse path", () => {
  let engine: ReturnType<typeof installTestEngine>;
  beforeEach(() => {
    vi.useFakeTimers();
    engine = installTestEngine();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats date with invertible:false as a wildcard", () => {
    const context = TemplateContext.empty()
      .date("date", CalendarDate.fromAnchor("2026-05-20" as AnchorString), "YYYY-MM-DD")
      .date("current_date", CalendarDate.today(), "YYYY-MM-DD", { invertible: false });
    const result = engine.parse(tokenize("{{current_date}}/{{date:YYYY-MM-DD}}.md"), "anything/2026-05-20.md", context);
    expectOk(result);
    const date = result.value.get("date");
    expect(date?.kind === "date" && date.value.toAnchor()).toBe("2026-05-20");
  });

  it("treats clock as a wildcard", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty()
      .date("date", CalendarDate.fromAnchor("2026-05-20" as AnchorString), "YYYY-MM-DD")
      .clock("time", Clock.now(), "HH:mm");
    const result = engine.parse(tokenize("{{time}}-{{date:YYYY-MM-DD}}.md"), "anything-2026-05-20.md", context);
    expectOk(result);
  });
});

describe("validation", () => {
  let engine: ReturnType<typeof installTestEngine>;
  beforeEach(() => {
    vi.useFakeTimers();
    engine = installTestEngine();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts :FORMAT on clock variables", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    const problems = engine.validate(tokenize("{{time:HH:mm:ss}}"), context);
    expect(problems).toEqual([]);
  });

  it("accepts modifiers on clock variables", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    const problems = engine.validate(tokenize("{{time-1h}}"), context);
    expect(problems).toEqual([]);
  });
});
