import { baseLocale, locales, setLocale } from "./paraglide/runtime.js";

export function matchLocale(input: string, available: readonly string[], fallback: string): string {
  const normalized = input.toLowerCase();
  if (available.includes(normalized)) return normalized;
  const dashIndex = normalized.indexOf("-");
  if (dashIndex > 0) {
    const prefix = normalized.slice(0, dashIndex);
    if (available.includes(prefix)) return prefix;
  }
  return fallback;
}

export function initLocale(locale: string): void {
  const matched = matchLocale(locale, locales, baseLocale);
  void setLocale(matched as (typeof locales)[number], { reload: false });
}
