<script setup lang="ts">
import { computed, inject, shallowRef, useTemplateRef, watch, type ComponentPublicInstance } from "vue";

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
import { roleFor, type ValueControl, type ValuePartKey, type Width } from "../appearance-parts";
import { appearanceSlice, UNCHANGED, type HighlightStyle } from "../slice";

import { AppearancePreviewRootKey } from "./preview-root-key";
import { stockNumber } from "./stock-number";
import { inheritedProperty, resolveStock, stockOption } from "./stock-value";

const { part, control, width } = defineProps<{ part: ValuePartKey; control: ValueControl; width: Width }>();

const slice = useService(SettingsService).getSlice(appearanceSlice);

// The keys are built from the part model; AppearanceControl.test.ts checks every one resolves to copy.
type ControlKey = Parameters<typeof m.calendar_appearance_control>[0]["control"];
type OptionKey = Parameters<typeof m.calendar_appearance_option>[0]["option"];

const family = computed(() => control.family);
const snake = (key: string): string => key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const label = computed(() =>
  m.calendar_appearance_control({ control: [family.value, ...control.path.map(snake)].join("_") as ControlKey }),
);

const entry = computed(() => appearanceCatalog.find((candidate) => candidate.name === control.entry));
const variable = computed(() => (entry.value === undefined ? undefined : publicName(entry.value, width === "narrow")));

const role = computed(() => {
  const style =
    family.value === "highlight"
      ? (valueAt(slice.state, width, part, ["style"]) as HighlightStyle | undefined)
      : undefined;
  return roleFor(control, style);
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
// At narrow, null means "no override", so picking Default would snap back to the wide value; it is
// offered there only while it is already what shows, and "Narrow only" is the way back to shared.
const offersDefault = computed(() => nullable.value && (width === "wide" || value.value === null));
const selectValue = computed(() => (typeof value.value === "string" ? value.value : ""));
const leaf = control.path.at(-1) ?? "";
const optionLabel = (option: string): string =>
  m.calendar_appearance_option({ option: `${leaf}_${option}` as OptionKey });
const defaultLabel = computed(() => {
  const option = stockShown.value === undefined ? undefined : stockOption(leaf, stockShown.value, readVariable);
  return option === undefined
    ? m.calendar_appearance_default()
    : m.calendar_appearance_default_resolved({ value: optionLabel(option) });
});
const choices = computed(() => {
  const named = (control.options ?? []).map((option) => ({ value: option, label: optionLabel(option) }));
  if (control.unchanged) return [{ value: UNCHANGED, label: m.calendar_appearance_unchanged() }, ...named];
  return offersDefault.value ? [{ value: "", label: defaultLabel.value }, ...named] : named;
});
function writeSelect(next: string): void {
  write(next === "" && nullable.value ? null : next);
}

const colorValue = computed(() => value.value as ColorSettings | typeof UNCHANGED | null);

// Obsidian defines theme variables on <body>; reading the body this control renders in keeps a
// popout window on its own theme.
const row = useTemplateRef<ComponentPublicInstance>("row");
const rowElement = computed<Element | undefined>(() => row.value?.$el as Element | undefined);
function readVariable(name: string): string {
  const body = rowElement.value?.ownerDocument.body;
  const view = body?.ownerDocument.defaultView;
  return body && view ? view.getComputedStyle(body).getPropertyValue(name) : "";
}
// A theme can set the root font size, and a rem stock renders against it, not against 16px.
function rootFontPx(): number | undefined {
  const root = rowElement.value?.ownerDocument.documentElement;
  const view = root?.ownerDocument.defaultView;
  if (!root || !view) return;
  const size = Number.parseFloat(view.getComputedStyle(root).fontSize);
  return Number.isFinite(size) ? size : undefined;
}

// The preview root inherits what the calendar does under this theme, and no part's own setting
// reaches it, so it is where an `inherit` stock is read.
const previewRoot = inject(AppearancePreviewRootKey, null);
function readStock(): string | undefined {
  const found = entry.value;
  if (found === undefined || rowElement.value === undefined) return;
  const stock = width === "narrow" ? (found.stockNarrow ?? found.stock) : found.stock;
  const root = previewRoot?.value;
  const property = inheritedProperty(leaf);
  const inherited =
    root && property ? root.ownerDocument.defaultView?.getComputedStyle(root).getPropertyValue(property) : undefined;
  return resolveStock(stock, readVariable, inherited);
}
// Computed style is not reactive: it is read after the DOM settles, again whenever the width
// switches, since the preview's computed style can differ between the two.
const stockShown = shallowRef<string | undefined>();
watch(
  [rowElement, () => previewRoot?.value, () => width],
  () => {
    stockShown.value = readStock();
  },
  { flush: "post", immediate: true },
);
const sliderNumber = computed<number | undefined>(() => {
  if (typeof value.value === "number") return value.value;
  if (typeof value.value !== "string" || control.range === undefined) return;
  return stockNumber(value.value, control.range.unit, readVariable, rootFontPx());
});
const atStock = computed(() => sourceAt(slice.state, width, part, control.path) === "stock");
const writesString = computed(() => typeof valueAt(appearanceSlice.defaults, "wide", part, control.path) === "string");
function writeSlider(next: number): void {
  write(writesString.value ? `${next}${control.range?.unit ?? ""}` : next);
}
</script>

<template>
  <UiSettingRow ref="row" class="appearance-control">
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
      <UiColorSettingsPicker
        :model-value="colorValue"
        :role="role"
        :unchanged="control.unchanged === true"
        :default="offersDefault"
        :default-color="stockShown ?? ''"
        @update:model-value="write"
      />
    </template>
    <template v-else-if="control.kind === 'slider' && control.range">
      <span class="appearance-control__value">
        <span v-if="sliderNumber !== undefined">{{ `${sliderNumber}${control.range.unit}` }}</span>
        <span v-if="atStock || sliderNumber === undefined" class="appearance-control__default">
          {{ m.calendar_appearance_default() }}
        </span>
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
.appearance-control__value {
  display: inline-flex;
  gap: var(--size-2-2);
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  white-space: nowrap;
}
.appearance-control__default {
  color: var(--text-faint);
}
</style>
