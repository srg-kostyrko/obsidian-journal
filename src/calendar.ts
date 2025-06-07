import { moment } from "obsidian";
import { extractCurrentLocaleData } from "./utils/moment";
import type { MomentDate } from "./types/date.types";
import type { WeekPreset } from "./types/calendar-ui.types";
import type { PluginSettings } from "./types/settings.types";

const CUSTOM_LOCALE = "custom-journal-locale";
export const initialWeekSettings: { dow: number; doy: number } = { dow: 0, doy: 0 };

export function initCalendarCustomization(): void {
  const currentLocale = moment.locale();
  const currentLocaleData = extractCurrentLocaleData();
  initialWeekSettings.dow = currentLocaleData.week.dow;
  initialWeekSettings.doy = currentLocaleData.week.doy;
  if (!moment.locales().includes(CUSTOM_LOCALE)) {
    moment.defineLocale(CUSTOM_LOCALE, currentLocaleData);
    moment.locale(currentLocale);
  }
}

export function calculateDoy(firstDayOfWeek: number, firstWeekOfYear: number): number {
  return 7 + firstDayOfWeek - firstWeekOfYear;
}
export function doyToDayNumber(dow: number, doy: number): number {
  return 7 + dow - doy;
}

export const updateLocale = (dow: number, doy: number, global?: boolean): void => {
  const currentLocale = moment.locale();
  moment.updateLocale(CUSTOM_LOCALE, {
    week: {
      dow,
      doy,
    },
  });
  moment.locale(currentLocale);

  if (global) {
    moment.updateLocale(currentLocale, {
      week: {
        dow,
        doy,
      },
    });
  }
};

export const restoreLocale = (global?: boolean): void => {
  const currentLocale = moment.locale();
  moment.updateLocale(CUSTOM_LOCALE, { week: initialWeekSettings });
  moment.locale(currentLocale);
  if (global) {
    moment.updateLocale(currentLocale, { week: initialWeekSettings });
  }
};

export function date_from_string(date?: string, format?: string): MomentDate {
  const md = date ? moment(date, format) : moment();
  md.locale(CUSTOM_LOCALE);
  return md;
}

export function today(): MomentDate {
  const md = moment();
  md.locale(CUSTOM_LOCALE);
  return md.startOf("day");
}

export function isSamePeriod(
  period: moment.unitOfTime.StartOf,
  a: string | MomentDate,
  b: string | MomentDate,
): boolean {
  const date1 = typeof a === "string" ? date_from_string(a) : a;
  const date2 = typeof b === "string" ? date_from_string(b) : b;
  return date1.isSame(date2, period);
}

export function dateDistance(fromDate: string, toDate: string): number {
  const from = date_from_string(fromDate);
  return Math.abs(from.diff(toDate, "days"));
}

const relativeDates = {
  day: relativeDay,
  week: relativeWeek,
  month: relativeMonth,
  quarter: relativeQuarter,
  year: relativeYear,
} as const;
function relativeDay(date: string): string {
  const md = date_from_string(date);

  return md.calendar(today(), {
    lastWeek: "[Last] dddd",
    lastDay: "[Yesterday]",
    sameDay: "[Today]",
    nextDay: "[Tomorrow]",
    nextWeek: "dddd",
    sameElse: function () {
      return "[" + md.from(today()) + "]";
    },
  });
}
function relativeWeek(date: string) {
  const thisWeek = today().startOf("week");
  const fromNow = date_from_string(date).startOf("week").diff(thisWeek, "week");
  switch (fromNow) {
    case 0: {
      return "This week";
    }
    case -1: {
      return "Last week";
    }
    case 1: {
      return "Next week";
    }
    // No default
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} weeks ago`;
  }
  return `${fromNow} weeks from now`;
}

function relativeMonth(date: string) {
  const thisMonth = today().startOf("month");
  const fromNow = date_from_string(date).diff(thisMonth, "month");
  switch (fromNow) {
    case 0: {
      return "This month";
    }
    case -1: {
      return "Last month";
    }
    case 1: {
      return "Next month";
    }
    // No default
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} months ago`;
  }
  return `${fromNow} months from now`;
}

function relativeQuarter(date: string) {
  const thisQuarter = today().startOf("quarter");
  const fromNow = date_from_string(date).diff(thisQuarter, "quarter");
  switch (fromNow) {
    case 0: {
      return "This quarter";
    }
    case -1: {
      return "Last quarter";
    }
    case 1: {
      return "Next quarter";
    }
    // No default
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} quarters ago`;
  }
  return `${fromNow} quarters from now`;
}

function relativeYear(date: string) {
  const thisYear = today().startOf("year");
  const fromNow = date_from_string(date).diff(thisYear, "year");
  switch (fromNow) {
    case 0: {
      return "This year";
    }
    case -1: {
      return "Last year";
    }
    case 1: {
      return "Next year";
    }
    // No default
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} years ago`;
  }
  return `${fromNow} years from now`;
}

export function relativeDate(type: keyof typeof relativeDates, date: string) {
  return relativeDates[type](date);
}

export const weekPresets: WeekPreset[] = [
  {
    name: "ISO 8601",
    description: "Week starts on Monday.\nFirst week of year includes 1st Thursday (Jan 4th)",
    used: "EU (exc. Portugal) and most of other European countries, most of Asia and Oceania",
    dow: 1,
    doy: 4,
  },
  {
    name: "Western traditional",
    description: "Week starts on Sunday.\nFirst week of year includes 1st Saturday (Jan 1st)",
    used: "Canada, United States, Iceland, Portugal, Japan, Taiwan, Thailand, Hong Kong, Macau, Israel, Egypt, South Africa, the Philippines, and most of Latin America",
    dow: 0,
    doy: 6,
  },
  {
    name: "Middle Eastern",
    description: "Week starts on Saturday.\nFirst week of year includes 1st Friday (Jan 1st)",
    used: "Much of the Middle East",
    dow: 6,
    doy: 12,
  },
];

export function detectCurrentPreset(settings: PluginSettings["calendar"]): WeekPreset {
  let { dow, doy } = settings;
  if (dow === -1) {
    // locale settings used
    dow = moment().localeData().firstDayOfWeek();
    doy = moment().localeData().firstDayOfYear();
  }

  const preset = weekPresets.find((p) => p.dow === dow && p.doy === doy);
  if (preset) return preset;

  const dayName = moment().locale("en").localeData().weekdays()[dow];
  const firstWeekOfYear = doyToDayNumber(dow, doy);
  return {
    name: "custom",
    description: `Week starts on ${dayName}.\nFirst week of year includes Jan ${firstWeekOfYear}`,
    used: "",
    dow,
    doy,
  };
}
