import { moment } from "obsidian";
import { extractCurrentlocaleData } from "./moment";
import { PluginSettings } from "../contracts/config.types";
import { MomentDate } from "../contracts/date.types";

const CUSTOM_LOCALE = "custom-journal-locale";

export class CalendarHelper {
  constructor(private config: PluginSettings["calendar"]) {
    if (!moment.locales().includes(CUSTOM_LOCALE)) {
      moment.defineLocale(CUSTOM_LOCALE, extractCurrentlocaleData());
    }
    this.updateLocale();
  }

  date(date?: string, format?: string): MomentDate {
    const md = date ? moment(date, format) : moment();
    if (this.config.firstDayOfWeek !== -1) {
      md.locale(CUSTOM_LOCALE);
    }
    return md;
  }

  today(): MomentDate {
    const md = moment();
    if (this.config.firstDayOfWeek !== -1) {
      md.locale(CUSTOM_LOCALE);
    }
    return md;
  }

  updateLocale(): void {
    moment.updateLocale(CUSTOM_LOCALE, {
      week: {
        dow: this.config.firstDayOfWeek,
        doy: 7 + this.config.firstDayOfWeek - (this.config.firstWeekOfYear ?? 1),
      },
    });
  }
}
