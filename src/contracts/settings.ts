export type SettingsRouteState =
  | {
      type: "home";
    }
  | {
      type: "journal";
      id: string;
    };
