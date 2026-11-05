<script setup lang="ts">
import { computed } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiSlider from "@/ui/UiSlider.vue";

import { appearanceCatalog, publicName } from "../appearance-catalog";
import {
  fromControlValue,
  sourceAt,
  toControlValue,
  valueAt,
  withNarrowCleared,
  withValue,
} from "../appearance-editing";
import { PARTS, type Control, type PartKey, type Width } from "../appearance-parts";
import { appearanceSlice, UNCHANGED } from "../slice";

const { part, control, width } = defineProps<{ part: PartKey; control: Control; width: Width }>();

const slice = useService(SettingsService).getSlice(appearanceSlice);

// The keys are built from the part model; AppearanceControl.test.ts checks every one resolves to copy.
type ControlKey = Parameters<typeof m.calendar_appearance_control>[0]["control"];
type OptionKey = Parameters<typeof m.calendar_appearance_option>[0]["option"];

const family = computed(() => PARTS[part].family);
const snake = (key: string): string => key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const label = computed(() =>
  m.calendar_appearance_control({ control: [family.value, ...control.path.map(snake)].join("_") as ControlKey }),
);

const variable = computed(() => {
  const entry = appearanceCatalog.find((candidate) => candidate.name === control.entry);
  return entry === undefined ? undefined : publicName(entry, width === "narrow");
});

const value = computed(() => toControlValue(control, valueAt(slice.state, width, part, control.path)));
const narrowOnly = computed(() => width === "narrow" && sourceAt(slice.state, width, part, control.path) === "narrow");

function write(next: unknown): void {
  slice.state = withValue(slice.state, width, part, control.path, fromControlValue(control, next));
}
function clearNarrow(): void {
  slice.state = withNarrowCleared(slice.state, part, control.path);
}

// A text part's leaves are nullable and null is its Default; a select cannot hold null, so "" stands in.
const nullable = computed(() => family.value === "text");
const selectValue = computed(() => (typeof value.value === "string" ? value.value : ""));
const choices = computed(() => {
  const group = control.path.at(-1) ?? "";
  const named = (control.options ?? []).map((option) => ({
    value: option,
    label: m.calendar_appearance_option({ option: `${group}_${option}` as OptionKey }),
  }));
  if (control.unchanged) return [{ value: UNCHANGED, label: m.calendar_appearance_unchanged() }, ...named];
  return nullable.value ? [{ value: "", label: m.calendar_appearance_default() }, ...named] : named;
});
function writeSelect(next: string): void {
  write(next === "" && nullable.value ? null : next);
}

// The picker has no Default, so a text color left at its default shows as a theme color not yet chosen.
const NO_THEME: ColorSettings = { type: "theme", name: "" };
const colorValue = computed<ColorSettings | typeof UNCHANGED>(
  () => (value.value as ColorSettings | typeof UNCHANGED | null | undefined) ?? NO_THEME,
);
const colorIsDefault = computed(() => value.value === null);

const NUMBER_WITH_UNIT = /^(-?\d*\.?\d+)(px|em|%)$/;
// A stock written as a theme expression has no position on the slider, so it reads Default until moved.
const sliderNumber = computed<number | undefined>(() => {
  if (typeof value.value === "number") return value.value;
  const match = typeof value.value === "string" ? NUMBER_WITH_UNIT.exec(value.value) : null;
  if (match === null || match[2] !== control.range?.unit) return;
  return Number(match[1]);
});
const writesString = computed(() => typeof valueAt(appearanceSlice.defaults, "wide", part, control.path) === "string");
function writeSlider(next: number): void {
  write(writesString.value ? `${next}${control.range?.unit ?? ""}` : next);
}
</script>

<template>
  <UiSettingRow class="appearance-control">
    <template #name>
      {{ label }}
      <button
        v-if="narrowOnly"
        type="button"
        class="appearance-control__tag"
        :title="m.calendar_appearance_narrow_only_clear()"
        @click="clearNarrow"
      >
        {{ m.calendar_appearance_narrow_only() }}
        <UiIcon :name="icons.action.reset" />
      </button>
    </template>
    <template #description>
      <code v-if="variable" class="appearance-control__variable">{{ variable }}</code>
    </template>
    <template v-if="control.kind === 'color'">
      <span v-if="colorIsDefault" class="appearance-control__default">{{ m.calendar_appearance_default() }}</span>
      <UiColorSettingsPicker
        :model-value="colorValue"
        :role="control.role ?? 'text'"
        :unchanged="control.unchanged === true"
        @update:model-value="write"
      />
    </template>
    <template v-else-if="control.kind === 'slider' && control.range">
      <span class="appearance-control__value">
        {{ sliderNumber === undefined ? m.calendar_appearance_default() : `${sliderNumber}${control.range.unit}` }}
      </span>
      <UiSlider
        :model-value="sliderNumber ?? control.range.min"
        :min="control.range.min"
        :max="control.range.max"
        :step="control.range.step"
        :label="label"
        @update:model-value="writeSlider"
      />
    </template>
    <UiDropdown v-else :model-value="selectValue" :aria-label="label" @update:model-value="writeSelect">
      <option v-for="choice of choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>

<style scoped>
.appearance-control__tag {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-1);
  margin-inline-start: var(--size-4-1);
  padding: 0 var(--size-4-1);
  height: auto;
  border-radius: var(--radius-s);
  font-size: var(--font-ui-smaller);
  background-color: var(--background-modifier-hover);
  color: var(--text-accent);
  box-shadow: none;
}
.appearance-control__variable {
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
}
.appearance-control__value,
.appearance-control__default {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
