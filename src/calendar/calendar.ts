import { moment } from "obsidian";
import { shallowRef, triggerRef } from "vue";

export const CUSTOM_LOCALE = "custom-journal-locale";

// The week configuration lives in moment's locale registry, which no Vue effect can observe:
// a mounted grid keeps its cached weeks until some unrelated change happens to invalidate it.
// Every date value is built through localMoment(), so holding the locale in a ref there makes
// anything derived from a date depend on it, and applyWeekConfig triggers the ref to re-run them.
const weekLocale = shallowRef(CUSTOM_LOCALE);

// A never-written clone of the locale as it stood before this plugin first touched it.
// applyWeekConfig with propagateToGlobal rewrites the global locale's week, and moment's locale
// registry outlives a plugin reload — so reading the locale's own week back off the global locale
// would return whatever the user last propagated. This keeps the real default recoverable.
const PRISTINE_LOCALE = "custom-journal-locale-pristine";

export interface WeekConfig {
  readonly dow: number;
  readonly doy: number;
}

type MomentConstructor = (
  input?: string | number | Date | moment.Moment | null,
  format?: string,
  language?: string,
  strict?: boolean,
) => moment.Moment;

export class Calendar {
  readonly #initial: WeekConfig;
  readonly #globalLocale: string;

  constructor() {
    const systemLocale = moment.locale();
    this.#globalLocale = systemLocale;

    const data = moment.localeData();
    // moment.defineLocale mutates `config.abbr` on the object passed in; clone at each use so
    // we don't corrupt the global locale's _config.abbr (which breaks moment.locale()).
    const sourceConfig = (data as unknown as { _config: moment.LocaleSpecification })._config;

    if (!moment.locales().includes(PRISTINE_LOCALE)) {
      moment.defineLocale(PRISTINE_LOCALE, { ...sourceConfig });
    }
    const pristine = moment.localeData(PRISTINE_LOCALE);
    this.#initial = { dow: pristine.firstDayOfWeek(), doy: pristine.firstDayOfYear() };

    if (!moment.locales().includes(CUSTOM_LOCALE)) {
      moment.defineLocale(CUSTOM_LOCALE, { ...sourceConfig });
    }
    moment.updateLocale(CUSTOM_LOCALE, { week: this.#initial });
    moment.locale(systemLocale);
  }

  applyWeekConfig(week: WeekConfig | "locale", options: { propagateToGlobal: boolean }): void {
    const effective = week === "locale" ? this.#initial : week;
    const currentLocale = moment.locale();

    if (week === "locale") {
      moment.updateLocale(this.#globalLocale, { week: this.#initial });
      moment.updateLocale(CUSTOM_LOCALE, { week: this.#initial });
    } else if (options.propagateToGlobal) {
      moment.updateLocale(this.#globalLocale, { week: effective });
      moment.updateLocale(CUSTOM_LOCALE, { week: effective });
    } else {
      moment.updateLocale(this.#globalLocale, { week: this.#initial });
      moment.updateLocale(CUSTOM_LOCALE, { week: effective });
    }

    moment.locale(currentLocale);
    triggerRef(weekLocale);
  }

  localeWeek(): WeekConfig {
    return { ...this.#initial };
  }

  weekdays(): readonly string[] {
    return moment.localeData(CUSTOM_LOCALE).weekdays();
  }

  weekdaysShort(): readonly { index: number; label: string }[] {
    const data = moment.localeData(CUSTOM_LOCALE);
    const first = data.firstDayOfWeek();
    const short = data.weekdaysShort();
    return Array.from({ length: 7 }, (_, offset) => {
      const index = (first + offset) % 7;
      return { index, label: short[index] };
    });
  }

  months(): readonly string[] {
    return moment.localeData(CUSTOM_LOCALE).months();
  }
}

export function localMoment(
  input?: string | number | Date | moment.Moment | null,
  format?: string,
  strict?: boolean,
): moment.Moment {
  const m = moment as unknown as MomentConstructor;
  const locale = weekLocale.value;
  // The locale has to be supplied at parse time, not applied to the result: week-based tokens
  // (w, W, gg, GG) resolve against the locale's week config while parsing, and relabelling an
  // instance afterwards cannot re-interpret a week number that has already been resolved.
  return m(input, format, locale, strict).locale(locale);
}
