import { m } from "@/i18n";

import { isFormat, isStructure, type Control, type StructureControl, type ValueControl } from "../appearance-parts";

// The keys are built from the part model; AppearanceControl.test.ts checks every one resolves to copy.
type ControlKey = Parameters<typeof m.calendar_appearance_control>[0]["control"];
type OptionKey = Parameters<typeof m.calendar_appearance_option>[0]["option"];

const snake = (key: string): string => key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

// A visibility control has no path, so its setting stands where a value control's path does; a
// format control's label does the same.
function segments(control: Control): readonly string[] {
  if (isStructure(control)) return [snake(control.setting)];
  return isFormat(control) ? [control.label] : control.path.map(snake);
}

export function controlLabel(control: Control): string {
  return m.calendar_appearance_control({ control: [control.family, ...segments(control)].join("_") as ControlKey });
}

// A format control has no options: its suggestions are patterns, shown as typed.
export function optionLabel(control: ValueControl | StructureControl, option: string): string {
  const leaf = isStructure(control) ? snake(control.setting) : (control.path.at(-1) ?? "");
  return m.calendar_appearance_option({ option: `${leaf}_${option}` as OptionKey });
}
