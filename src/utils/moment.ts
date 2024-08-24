import { moment } from "obsidian";

export function extractCurrentlocaleData() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localeData: any = moment.localeData();
  return {
    ...localeData._config,
    ordinal: localeData._config.ordinal,
    meridiem: localeData._config.meridiem,
    meridiemParse: localeData._config.meridiemParse,
    dayOfMonthOrdinalParse: localeData._config.dayOfMonthOrdinalParse,
    isPM: localeData._config.isPM,
  };
}

const localeData = moment.localeData();
const formatRegExpParts = new Map([
  [
    "o",
    String((localeData as any)._config.dayOfMonthOrdinalParse) // eslint-disable-line @typescript-eslint/no-explicit-any
      .replace("/\\d{1,2}", "")
      .slice(0, -1),
  ],
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
const supportedSymbols = new Set(["o", "M", "Q", "D", "d", "w", "W", "Y"]);

export function formatToRegexp(format: string): RegExp {
  const parts = [];

  let lastChar = "";
  let lastCharCount = 0;
  let exact = false;
  let exactText = "";

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
      exact = true;
    } else {
      if (supportedSymbols.has(char)) {
        if (lastChar === char) {
          lastCharCount++;
        } else {
          if (lastCharCount > 0) {
            const prepared = formatRegExpParts.get(lastChar.repeat(lastCharCount));
            if (prepared) parts.push(prepared);
          }
          lastCharCount = 1;
          lastChar = char;
        }
      } else {
        if (lastCharCount > 0) {
          const prepared = formatRegExpParts.get(lastChar.repeat(lastCharCount));
          if (prepared) parts.push(prepared);
          lastCharCount = 0;
          lastChar = "";
        }
        parts.push(char);
      }
    }
  }
  if (lastCharCount > 0) {
    const prepared = formatRegExpParts.get(lastChar.repeat(lastCharCount));
    if (prepared) parts.push(prepared);
    lastCharCount = 0;
    lastChar = "";
  }
  return new RegExp(parts.join(""));
}
