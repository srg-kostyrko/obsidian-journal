import { moment } from "obsidian";

import { Calendar, type WeekConfig } from "./calendar";

export function installTestCalendar(week?: Partial<WeekConfig>): { teardown: () => void } {
  const priorLocale = moment.locale();
  new Calendar({ dow: week?.dow ?? 1, doy: week?.doy ?? 4 });

  return {
    teardown: () => {
      moment.locale(priorLocale);
    },
  };
}
