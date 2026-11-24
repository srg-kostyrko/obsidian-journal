import { dayOfMonthOrdinalParse, localeData } from "@/calendar";

// Locale data is captured at module-import time. Plugin load fixes the locale before
// this module is imported; runtime locale changes do not affect compiled patterns.
// Tests therefore exercise locale-insensitive tokens only.
const locale = localeData();

// .source strips the delimiters and the leading \d{1,2} (the day digits, matched by the D token).
const ordinalRegexp = dayOfMonthOrdinalParse();
export const ordinalPattern =
  ordinalRegexp == null ? "(?:th|st|nd|rd)" : ordinalRegexp.source.replace(String.raw`\d{1,2}`, "");

// A locale may name the half of the day by hour and minute -- zh splits it six ways -- so every
// half hour is sampled rather than just one morning and one evening.
function meridiemPattern(isLower: boolean): string {
  const names = new Set<string>();
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    names.add(locale.meridiem(Math.floor(minutes / 60), minutes % 60, isLower));
  }
  return "(?:" + [...names].map((name) => escapeRegexLiteral(name)).join("|") + ")";
}

const formatRegExpParts = new Map<string, string>([
  ["o", ordinalPattern],
  ["M", "(?:[1-9]|1[0-2])"],
  ["MM", "(?:0[1-9]|1[0-2])"],
  ["MMM", "(?:" + locale.monthsShort().join("|") + ")"],
  ["MMMM", "(?:" + locale.months().join("|") + ")"],
  ["Q", "[1-4]"],
  ["D", "[0-9]{1,2}"],
  ["DD", "[0-9]{2}"],
  ["DDD", "[0-9]{1,3}"],
  ["DDDD", "[0-9]{3}"],
  ["d", "[0-6]"],
  ["dd", "(?:" + locale.weekdaysMin().join("|") + ")"],
  ["ddd", "(?:" + locale.weekdaysShort().join("|") + ")"],
  ["dddd", "(?:" + locale.weekdays().join("|") + ")"],
  ["w", "[0-9]{1,2}"],
  ["ww", "[0-9]{2}"],
  ["W", "[0-9]{1,2}"],
  ["WW", "[0-9]{2}"],
  ["YY", "[0-9]{2}"],
  ["YYYY", "[0-9]{4}"],
  ["gg", "[0-9]{2}"],
  ["gggg", "[0-9]{4}"],
  ["GG", "[0-9]{2}"],
  ["GGGG", "[0-9]{4}"],
  ["H", "[0-9]{1,2}"],
  ["HH", "[0-9]{2}"],
  ["h", "[0-9]{1,2}"],
  ["hh", "[0-9]{2}"],
  ["k", "[0-9]{1,2}"],
  ["kk", "[0-9]{2}"],
  ["m", "[0-9]{1,2}"],
  ["mm", "[0-9]{2}"],
  ["s", "[0-9]{1,2}"],
  ["ss", "[0-9]{2}"],
  ...Array.from({ length: 9 }, (_, index): [string, string] => ["S".repeat(index + 1), `[0-9]{${index + 1}}`]),
  ["A", meridiemPattern(false)],
  ["a", meridiemPattern(true)],
  // Seconds and milliseconds since the epoch, which is neither fixed-width nor unsigned: a date
  // before September 2001 renders one digit shorter, and one before 1970 renders negative.
  ["X", "-?[0-9]+"],
  ["x", "-?[0-9]+"],
]);

const supportedSymbols = new Set([
  "o",
  "M",
  "Q",
  "D",
  "d",
  "w",
  "W",
  "Y",
  "g",
  "G",
  "X",
  "x",
  "H",
  "h",
  "k",
  "m",
  "s",
  "S",
  "A",
  "a",
]);

// moment's localized formats are shorthands for a format the locale supplies -- LL is "MMMM D, YYYY"
// in en-US and "D. MMMM YYYY" in de -- and its own parser expands them before reading a date, which
// is why a name written with one is written correctly and matched nothing. Expanding them here is
// what lets the pattern see the tokens underneath. Anything inside [] is the user's own text and is
// left alone.
const LONG_DATE_TOKEN = /(\[[^\]]*\])|(LTS?|L{1,4}|l{1,4})/g;

function expandLocalizedFormats(format: string): string {
  return format.replaceAll(LONG_DATE_TOKEN, (whole, literal: string | undefined, token: string | undefined) =>
    literal !== undefined || token === undefined ? whole : (locale.longDateFormat(token as "LL") ?? whole),
  );
}

type FormatSegment =
  | { kind: "literal"; text: string }
  | { kind: "bracketed"; text: string; raw: string }
  | { kind: "escaped"; text: string; raw: string }
  | { kind: "run"; text: string };

// One walk for everything that reads a moment format: text inside [] is the user's own, and a run of
// one ASCII letter is a token candidate. Any other character is literal, as it is to moment.
function* segmentsOf(format: string): Generator<FormatSegment> {
  let index = 0;
  while (index < format.length) {
    const char = format.charAt(index);
    if (char === "[") {
      const close = format.indexOf("]", index + 1);
      const stop = close === -1 ? format.length : close;
      yield { kind: "bracketed", text: format.slice(index + 1, stop), raw: format.slice(index, stop + 1) };
      index = stop + 1;
      continue;
    }
    // moment renders the character after a backslash as itself and drops the backslash.
    if (char === "\\") {
      const escaped = format.charAt(index + 1);
      yield { kind: "escaped", text: escaped, raw: format.slice(index, index + 2) };
      index += 2;
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      let stop = index + 1;
      while (format.charAt(stop) === char) stop++;
      yield { kind: "run", text: format.slice(index, stop) };
      index = stop;
      continue;
    }
    yield { kind: "literal", text: char };
    index++;
  }
}

export function formatToRegexp(source: string): RegExp {
  const parts: string[] = [];
  const segments = segmentsOf(expandLocalizedFormats(source));
  for (const segment of segments) {
    if (segment.kind !== "run") {
      parts.push(escapeRegexLiteral(segment.text));
    } else if (supportedSymbols.has(segment.text.charAt(0))) {
      const prepared = formatRegExpParts.get(segment.text);
      if (prepared) parts.push(prepared);
    } else {
      parts.push(escapeRegexLiteral(segment.text));
    }
  }
  return new RegExp(parts.join(""));
}

/** The token runs of a moment format, bracketed text excluded. */
export function momentTokens(format: string): readonly string[] {
  return [...segmentsOf(expandLocalizedFormats(format))]
    .filter((segment) => segment.kind === "run")
    .map((segment) => segment.text);
}

// Tokens moment renders but the reverse parser does not know. Any other unsupported letter is
// literal text to moment too, so it renders as itself and reads back fine.
const UNREADABLE_TOKEN_LETTERS = new Set(["y", "N", "e", "E", "Z", "z"]);

/** The tokens in a format that a rendered note name cannot be read back from. */
export function unsupportedTokens(format: string): readonly string[] {
  return momentTokens(format).filter((token) => UNREADABLE_TOKEN_LETTERS.has(token.charAt(0)));
}

/**
 * Rewrites the token runs of a format, keeping every other character as written. `map` may swallow
 * the segment after a run (an ordinal `o`) by returning `consumed: 1`.
 */
export function mapFormatRuns(
  format: string,
  map: (run: string, next: string | undefined) => { text: string; consumed: 0 | 1 },
): string {
  const segments = [...segmentsOf(format)];
  let output = "";
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment === undefined) continue;
    if (segment.kind === "bracketed" || segment.kind === "escaped") output += segment.raw;
    else if (segment.kind === "literal") output += segment.text;
    else {
      const next = segments[index + 1];
      const { text, consumed } = map(segment.text, next?.kind === "run" ? next.text : undefined);
      output += text;
      index += consumed;
    }
  }
  return output;
}

export function escapeRegexLiteral(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
