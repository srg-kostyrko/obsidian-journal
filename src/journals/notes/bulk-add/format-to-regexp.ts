import { localMoment } from "@/calendar/calendar";

const SUPPORTED_SYMBOLS = new Set(["o", "M", "Q", "D", "d", "w", "W", "Y"]);

// moment locale internals expose _config on the localeData object but are untyped in @types/moment
interface MomentLocaleInternals {
  _config?: { dayOfMonthOrdinalParse?: RegExp };
}

function buildParts(): Map<string, string> {
  const localeData = localMoment().localeData();
  // Access the undocumented _config to read the ordinal parse pattern, same as v2;
  // .source strips the regexp delimiters; the pattern always begins with \d{1,2} which we drop
  const ordinalRegexp = (localeData as unknown as MomentLocaleInternals)._config?.dayOfMonthOrdinalParse;
  const ordinalPattern =
    ordinalRegexp == null ? "(th|st|nd|rd)" : ordinalRegexp.source.replace(String.raw`\d{1,2}`, "");

  return new Map([
    ["o", ordinalPattern],
    ["M", "([1-9]|1[0-2])"],
    ["MM", "(0[1-9]|1[0-2])"],
    ["MMM", "(" + localeData.monthsShort().join("|") + ")"],
    ["MMMM", "(" + localeData.months().join("|") + ")"],
    ["Q", "[1-4]"],
    ["D", "[0-9]{1,2}"],
    ["DD", "[0-9]{2}"],
    ["DDD", "[1-9]{1,3}"],
    ["DDDD", "[1-9]{3}"],
    ["d", "[0-6]"],
    ["dd", "(" + localeData.weekdaysMin().join("|") + ")"],
    ["ddd", "(" + localeData.weekdaysShort().join("|") + ")"],
    ["dddd", "(" + localeData.weekdays().join("|") + ")"],
    ["w", "[0-9]{1,2}"],
    ["ww", "[0-9]{2}"],
    ["W", "[0-9]{1,2}"],
    ["WW", "[0-9]{2}"],
    ["YY", "[0-9]{2}"],
    ["YYYY", "[0-9]{4}"],
  ]);
}

export function formatToRegexp(format: string): RegExp {
  const parts: string[] = [];
  const formatParts = buildParts();

  let lastChar = "";
  let lastCharCount = 0;
  let exact = false;
  let exactText = "";

  const flush = (): void => {
    if (lastCharCount <= 0) return;
    const prepared = formatParts.get(lastChar.repeat(lastCharCount));
    if (prepared) parts.push(prepared);
    lastCharCount = 0;
    lastChar = "";
  };

  for (const char of format) {
    if (exact) {
      if (char === "]") {
        parts.push(exactText);
        exact = false;
        exactText = "";
      } else {
        exactText += char;
      }
    } else if (char === "[") {
      flush();
      exact = true;
    } else if (SUPPORTED_SYMBOLS.has(char)) {
      if (lastChar === char) {
        lastCharCount++;
      } else {
        flush();
        lastCharCount = 1;
        lastChar = char;
      }
    } else {
      flush();
      parts.push(char.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
    }
  }
  flush();

  return new RegExp(parts.join(""));
}
