import { moment } from "obsidian";

export const CUSTOM_LOCALE = "custom-journal-locale";

export interface WeekConfig {
  readonly dow: number;
  readonly doy: number;
}

type MomentConstructor = (
  input?: string | number | Date | moment.Moment | null,
  format?: string,
  strict?: boolean,
) => moment.Moment;

export class Calendar {
  readonly #initial: WeekConfig;
  readonly #globalLocale: string;

  constructor() {
    const systemLocale = moment.locale();
    this.#globalLocale = systemLocale;

    const data = moment.localeData();
    this.#initial = { dow: data.firstDayOfWeek(), doy: data.firstDayOfYear() };

    if (!moment.locales().includes(CUSTOM_LOCALE)) {
      const sourceConfig = (data as unknown as { _config: moment.LocaleSpecification })._config;
      // moment.defineLocale mutates `config.abbr` on the object passed in; clone so
      // we don't corrupt the global locale's _config.abbr (which breaks moment.locale()).
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
  const instance = m(input, format, strict);
  return instance.locale(CUSTOM_LOCALE);
}
