import { computed } from "vue";
import { moment } from "obsidian";
import { extractCurrentlocaleData } from "./utils/moment";
import { calendarSettings$ } from "./stores/settings.store";
import type { MomentDate } from "./types/date.types";

const CUSTOM_LOCALE = "custom-journal-locale";

export function initCalendarCustomization(): void {
  if (!moment.locales().includes(CUSTOM_LOCALE)) {
    const currentLocale = moment.locale();
    moment.defineLocale(CUSTOM_LOCALE, extractCurrentlocaleData());
    moment.locale(currentLocale);
  }
}

export function date_from_string(date?: string, format?: string): MomentDate {
  const md = date ? moment(date, format) : moment();
  if (calendarSettings$.value.firstDayOfWeek !== -1) {
    md.locale(CUSTOM_LOCALE);
  }
  return md;
}

export function today(): MomentDate {
  const md = moment();
  if (calendarSettings$.value.firstDayOfWeek !== -1) {
    md.locale(CUSTOM_LOCALE);
  }
  return md.startOf("day");
}

export const weekdayNames = computed(() => {
  const weekdayNames: string[] = [];
  const week = today().startOf("week");
  const weekEnd = today().endOf("week");

  while (week.isSameOrBefore(weekEnd)) {
    weekdayNames.push(week.format("ddd"));
    week.add(1, "day");
  }

  return weekdayNames;
});

export const updateLocale = (firstDayOfWeek: number, firstWeekOfYear: number): void => {
  const currentLocale = moment.locale();
  moment.updateLocale(CUSTOM_LOCALE, {
    week: {
      dow: firstDayOfWeek,
      doy: 7 + firstDayOfWeek - (firstWeekOfYear ?? 1),
    },
  });
  moment.locale(currentLocale);
};

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
  const fromNow = date_from_string(date).diff(thisWeek, "week");
  if (fromNow === 0) {
    return "This week";
  } else if (fromNow === -1) {
    return "Last week";
  } else if (fromNow === 1) {
    return "Next week";
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} weeks ago`;
  }
  return `${fromNow} weeks from now`;
}

function relativeMonth(date: string) {
  const thisMonth = today().startOf("month");
  const fromNow = date_from_string(date).diff(thisMonth, "month");
  if (fromNow === 0) {
    return "This month";
  } else if (fromNow === -1) {
    return "Last month";
  } else if (fromNow === 1) {
    return "Next month";
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} months ago`;
  }
  return `${fromNow} months from now`;
}

function relativeQuarter(date: string) {
  const thisQuarter = today().startOf("quarter");
  const fromNow = date_from_string(date).diff(thisQuarter, "quarter");
  if (fromNow === 0) {
    return "This quarter";
  } else if (fromNow === -1) {
    return "Last quarter";
  } else if (fromNow === 1) {
    return "Next quarter";
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} quarters ago`;
  }
  return `${fromNow} quarters from now`;
}

function relativeYear(date: string) {
  const thisYear = today().startOf("year");
  const fromNow = date_from_string(date).diff(thisYear, "year");
  if (fromNow === 0) {
    return "This year";
  } else if (fromNow === -1) {
    return "Last year";
  } else if (fromNow === 1) {
    return "Next year";
  }
  if (fromNow < 0) {
    return `${Math.abs(fromNow)} years ago`;
  }
  return `${fromNow} years from now`;
}

export function relativeDate(type: keyof typeof relativeDates, date: string) {
  return relativeDates[type](date);
}
