// cspell: ignore yyyyo YYYYo
import { describe, expect, it } from "vitest";

import { hasEraYear, replaceEraYear, replaceEraYearInTemplate, templateHasEraYear } from "./era-year";
import { momentTokens, unsupportedTokens } from "./format-regex";

describe("momentTokens", () => {
  it("lists each same-letter run outside brackets", () => {
    expect(momentTokens("YYYY-[Day] yyyy")).toEqual(["YYYY", "yyyy"]);
  });

  it("treats bracketed text as literal", () => {
    expect(momentTokens("[y]")).toEqual([]);
  });
});

describe("unsupportedTokens", () => {
  it("keeps only the tokens the reverse parser cannot read back", () => {
    expect(unsupportedTokens("YYYY-MM-DD ZZ e")).toEqual(["ZZ", "e"]);
  });
});

describe("hasEraYear", () => {
  it("ignores a y inside brackets", () => {
    expect(hasEraYear("YYYY-[Daily]")).toBe(false);
  });

  it("finds a y run", () => {
    expect(hasEraYear("yyyy-MM")).toBe(true);
  });
});

describe("replaceEraYear", () => {
  it("maps each run to its calendar-year counterpart and leaves bracketed text alone", () => {
    expect(replaceEraYear("yyyy-[y]-yy")).toBe("YYYY-[y]-YY");
  });

  it("maps a lone y to YYYY, since the reverse parser has no pattern for Y", () => {
    expect(replaceEraYear("D.M.y")).toBe("D.M.YYYY");
  });

  it("keeps a literal o after a longer run, which is not an ordinal year", () => {
    expect(replaceEraYear("yyyyo")).toBe("YYYYo");
  });

  it("maps an odd-length run to YYYY", () => {
    expect(replaceEraYear("yyy")).toBe("YYYY");
  });

  it("maps the ordinal era year to YYYY", () => {
    expect(replaceEraYear("yo")).toBe("YYYY");
  });
});

describe("era year in templates", () => {
  it("rewrites only the format of date tokens and keeps everything else byte-identical", () => {
    expect(replaceEraYearInTemplate("Week {{date+1d:yyyy}}-{{start_date:[y]ww}} {{title}} {{journal_link:x}}")).toBe(
      "Week {{date+1d:YYYY}}-{{start_date:[y]ww}} {{title}} {{journal_link:x}}",
    );
  });

  it("keeps whitespace inside a token's braces", () => {
    expect(replaceEraYearInTemplate("{{date:yyyy }}-{{ date:yyyy-MM-DD }}")).toBe(
      "{{date:YYYY }}-{{ date:YYYY-MM-DD }}",
    );
  });

  it("ignores a y in literal text and in non-date variables", () => {
    expect(templateHasEraYear("{{note_name}} y")).toBe(false);
  });

  it("finds a y in a date token's format", () => {
    expect(templateHasEraYear("{{END_DATE:yy}}")).toBe(true);
  });
});
