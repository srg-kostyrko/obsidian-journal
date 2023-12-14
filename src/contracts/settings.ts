import { CalendarGranularity } from "./config.types";

export type SettingsRouteState =
  | {
      type: "home";
    }
  | {
      type: "journal";
      id: string;
      section?: CalendarGranularity;
    };
