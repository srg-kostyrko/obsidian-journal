import { dayOfMonthOrdinalParse, localeData } from "@/calendar";

// Locale data is captured at module-import time. Plugin load fixes the locale before
// this module is imported; runtime locale changes do not affect compiled patterns.
// Tests therefore exercise locale-insensitive tokens only.
const locale = localeData();

// .source strips the delimiters and the leading \d{1,2} (the day digits, matched by the D token).
const ordinalRegexp = dayOfMonthOrdinalParse();
const ordinalPattern =
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
  ["DDD", "[1-9]{1,3}"],
  ["DDDD", "[1-9]{3}"],
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
]);

const supportedSymbols = new Set(["o", "M", "Q", "D", "d", "w", "W", "Y"]);

export function formatToRegexp(format: string): RegExp {
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
