export interface SettingsNotice {
  readonly kind: "slice-reset" | "save-failed";
  readonly sliceKey: string;
  readonly detail: string;
}
