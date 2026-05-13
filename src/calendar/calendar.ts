import { moment } from "obsidian";

export const CUSTOM_LOCALE = "custom-journal-locale";

const DEFAULT_WEEK = { dow: 1, doy: 4 } as const;

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
  constructor(week: WeekConfig = DEFAULT_WEEK) {
    this.#initializeLocale(week);
  }

  #initializeLocale(week: WeekConfig): void {
    const systemLocale = moment.locale();

    if (!moment.locales().includes(CUSTOM_LOCALE)) {
      const sourceConfig = (moment.localeData() as unknown as { _config: moment.LocaleSpecification })._config;
      moment.defineLocale(CUSTOM_LOCALE, sourceConfig);
    }
    moment.updateLocale(CUSTOM_LOCALE, { week: { dow: week.dow, doy: week.doy } });

    moment.locale(systemLocale);
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
