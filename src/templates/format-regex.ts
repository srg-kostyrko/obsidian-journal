import { dayOfMonthOrdinalParse, localeData } from "@/calendar";

// Locale data is captured at module-import time. Plugin load fixes the locale before
// this module is imported; runtime locale changes do not affect compiled patterns.
// Tests therefore exercise locale-insensitive tokens only.
const locale = localeData();

// .source strips the delimiters and the leading \d{1,2} (the day digits, matched by the D token).
const ordinalRegexp = dayOfMonthOrdinalParse();
export const ordinalPattern =
  ordinalRegexp == null ? "(?:th|st|nd|rd)" : ordinalRegexp.source.replace(String.raw`\d{1,2}`, "");

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
  // Seconds and milliseconds since the epoch. Both are fixed-width for every date Obsidian can
  // hold, so neither needs the locale.
  ["X", "[0-9]{10}"],
  ["x", "[0-9]{13}"],
]);

const supportedSymbols = new Set(["o", "M", "Q", "D", "d", "w", "W", "Y", "g", "G", "X", "x"]);

// moment's localized formats are shorthands for a format the locale supplies -- LL is "MMMM D, YYYY"
// in en-US and "D. MMMM YYYY" in de -- and its own parser expands them before reading a date, which
// is why a name written with one is written correctly and matched nothing. Expanding them here is
// what lets the pattern see the tokens underneath. Anything inside [] is the user's own text and is
// left alone.
const LONG_DATE_TOKEN = /(\[[^\]]*\])|(L{1,4}|l{1,4}|LTS?)/g;

function expandLocalizedFormats(format: string): string {
  return format.replaceAll(LONG_DATE_TOKEN, (whole, literal: string | undefined, token: string | undefined) =>
    literal !== undefined || token === undefined ? whole : (locale.longDateFormat(token as "LL") ?? whole),
  );
}

export function formatToRegexp(source: string): RegExp {
  const format = expandLocalizedFormats(source);
  const parts: string[] = [];

  let lastChar = "";
  let lastCharCount = 0;
  let exact = false;
  let exactText = "";

  const flushSymbol = () => {
    if (lastCharCount <= 0) return;
    const prepared = formatRegExpParts.get(lastChar.repeat(lastCharCount));
    if (prepared) parts.push(prepared);
    lastCharCount = 0;
    lastChar = "";
  };

  for (const char of format) {
    if (exact) {
      if (char === "]") {
        parts.push(escapeRegexLiteral(exactText));
        exact = false;
        exactText = "";
      } else {
        exactText += char;
      }
      continue;
    }
    if (char === "[") {
      flushSymbol();
      exact = true;
      continue;
    }
    if (supportedSymbols.has(char)) {
      if (lastChar === char) {
        lastCharCount++;
      } else {
        flushSymbol();
        lastCharCount = 1;
        lastChar = char;
      }
    } else {
      flushSymbol();
      parts.push(escapeRegexLiteral(char));
    }
  }
  flushSymbol();
  return new RegExp(parts.join(""));
}

export function escapeRegexLiteral(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
