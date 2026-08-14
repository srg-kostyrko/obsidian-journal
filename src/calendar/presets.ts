export interface WeekPreset {
  readonly id: "iso-8601" | "western" | "middle-eastern";
  readonly dow: number;
  readonly doy: number;
}

export const weekPresets: readonly WeekPreset[] = [
  { id: "iso-8601", dow: 1, doy: 4 },
  { id: "western", dow: 0, doy: 6 },
  { id: "middle-eastern", dow: 6, doy: 12 },
];

export function detectCurrentPreset(week: { dow: number; doy: number }): WeekPreset | "custom" {
  return weekPresets.find((p) => p.dow === week.dow && p.doy === week.doy) ?? "custom";
}
