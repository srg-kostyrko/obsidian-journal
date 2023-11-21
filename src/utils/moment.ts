import { moment } from "obsidian";
import { deepCopy } from "../utils";

export function extractCurrentlocaleData() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localeData: any = moment.localeData();
  return {
    ...deepCopy(localeData._config),
    ordinal: localeData._config.ordinal,
    meridiem: localeData._config.meridiem,
    meridiemParse: localeData._config.meridiemParse,
    dayOfMonthOrdinalParse: localeData._config.dayOfMonthOrdinalParse,
    isPM: localeData._config.isPM,
  };
}
