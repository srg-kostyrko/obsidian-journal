<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { computed, inject, shallowRef, useTemplateRef, watch, type ComponentPublicInstance } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiSlider from "@/ui/UiSlider.vue";

import { appearanceCatalog, publicName } from "../appearance-catalog";
import {
  fromControlValue,
  hasStockNarrow,
  narrowDiffersFromWide,
  sourceAt,
  toControlValue,
  valueAt,
  withNarrowCleared,
  withNarrowFromWide,
  withValue,
} from "../appearance-editing";
import { roleFor, type ValueControl, type ValuePartKey, type Width } from "../appearance-parts";
import { appearanceSlice, UNCHANGED, type HighlightStyle } from "../slice";

import AppearanceNarrowTag from "./AppearanceNarrowTag.vue";
import { controlLabel, optionLabel as controlOptionLabel } from "./control-copy";
import { AppearancePreviewRootKey } from "./preview-root-key";
import { stockNumber } from "./stock-number";
import { inheritedProperty, resolveStock, stockOption } from "./stock-value";

const { part, control, width } = defineProps<{ part: ValuePartKey; control: ValueControl; width: Width }>();

const slice = useService(SettingsService).getSlice(appearanceSlice);

const family = computed(() => control.family);
const label = computed(() => controlLabel(control));

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
const narrowOverridden = computed(() => sourceAt(slice.state, "narrow", part, control.path) === "narrow");
// At Wide, a narrow value of its own, stock or set, would keep the wide one off narrow calendars without a word.
const narrowTag = computed(() => {
  if (width === "narrow") return narrowOverridden.value ? "only" : null;
  return narrowDiffersFromWide(slice.state, part, control.path) ? "own" : null;
});
// Narrow cannot hold Default, so a wide value at Default has nothing to apply.
const canApplyToNarrow = computed(() => valueAt(slice.state, "wide", part, control.path) !== null);

function write(next: unknown): void {
  slice.state = withValue(slice.state, width, part, control.path, fromControlValue(control, next));
}
function clearNarrow(): void {
  slice.state = withNarrowCleared(slice.state, part, control.path);
}
function applyToNarrow(): void {
  slice.state = withNarrowFromWide(slice.state, part, control.path);
}

// A text part's leaves are nullable and null is its Default; a select cannot hold null, so "" stands in.
const nullable = computed(() => family.value === "text");
// At narrow, null means "no override", so picking Default would snap back to the wide value; it is
// offered there only while it is already what shows, and "Narrow only" is the way back to shared.
const offersDefault = computed(() => nullable.value && (width === "wide" || value.value === null));
const selectValue = computed(() => (typeof value.value === "string" ? value.value : ""));
const leaf = control.path.at(-1) ?? "";
const optionLabel = (option: string): string => controlOptionLabel(control, option);
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
const stockString = computed(() => {
  const found = entry.value;
  if (found === undefined) return;
  return width === "narrow" ? (found.stockNarrow ?? found.stock) : found.stock;
});
function readStock(): string | undefined {
  const stock = stockString.value;
  if (stock === undefined || rowElement.value === undefined) return;
  const root = previewRoot?.value;
  const property = inheritedProperty(leaf);
  const inherited =
    root && property ? root.ownerDocument.defaultView?.getComputedStyle(root).getPropertyValue(property) : undefined;
  return resolveStock(stock, readVariable, inherited);
}
// A stock that grows with the calendar's width has no one number, so the slider sits on what the
// preview's cell renders at instead.
const MEASURED: Readonly<Record<string, string>> = { minHeight: "min-height" };
const growing = computed(() => {
  const stock = stockString.value;
  if (stock === undefined || MEASURED[leaf] === undefined || control.range === undefined) return false;
  return stockNumber(stock, control.range.unit, readVariable, rootFontPx()) === undefined;
});
function readMeasured(): number | undefined {
  const property = MEASURED[leaf];
  // A day, not the first cell: the heading's cells keep the flat floor while a day's row grows.
  const cell = previewRoot?.value?.querySelector('[data-preview-part="date"]');
  const view = cell?.ownerDocument.defaultView;
  if (property === undefined || !cell || !view) return;
  const measured = Number.parseFloat(view.getComputedStyle(cell).getPropertyValue(property));
  return Number.isFinite(measured) ? Math.round(measured) : undefined;
}
// Computed style is not reactive: it is read after the DOM settles, again whenever the width
// switches, since the preview's computed style can differ between the two. A measured row is read
// again after its own value changes and when the preview resizes, since both move what it renders at.
const stockShown = shallowRef<string | undefined>();
const measuredShown = shallowRef<number | undefined>();
watch(
  [rowElement, () => previewRoot?.value, () => width],
  () => {
    stockShown.value = readStock();
    measuredShown.value = readMeasured();
  },
  { flush: "post", immediate: true },
);
watch(
  value,
  () => {
    measuredShown.value = readMeasured();
  },
  { flush: "post" },
);
useResizeObserver(
  () => previewRoot?.value,
  () => {
    measuredShown.value = readMeasured();
  },
);
const sliderNumber = computed<number | undefined>(() => {
  if (typeof value.value === "number") return value.value;
  if (control.range === undefined) return;
  if (typeof value.value === "string") return stockNumber(value.value, control.range.unit, readVariable, rootFontPx());
  return growing.value ? measuredShown.value : undefined;
});
const atStock = computed(() => sourceAt(slice.state, width, part, control.path) === "stock");
const writesString = computed(() => typeof valueAt(appearanceSlice.defaults, "wide", part, control.path) === "string");
function writeSlider(next: number): void {
  write(writesString.value ? `${next}${control.range?.unit ?? ""}` : next);
}
// A slider leaf whose stock is null has a Default no position can reach, so it gets a button back to it.
// At Narrow the "Narrow only" tag is the way back, as it is for a select.
const offersSliderDefault = computed(
  () =>
    width === "wide" && value.value !== null && valueAt(appearanceSlice.defaults, "wide", part, control.path) === null,
);
const sliderDefaultLabel = computed(() =>
  growing.value ? m.calendar_appearance_default_grows() : m.calendar_appearance_default(),
);
</script>

<template>
  <UiSettingRow ref="row" class="appearance-control">
    <template #name>
      {{ label }}
      <AppearanceNarrowTag
        :tag="narrowTag"
        :can-apply="canApplyToNarrow"
        :stock-narrow="hasStockNarrow(part, control.path)"
        @clear="clearNarrow"
        @apply="applyToNarrow"
      />
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
          {{ sliderDefaultLabel }}
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
      <UiIconButton
        v-if="offersSliderDefault"
        :icon="icons.action.reset"
        :tooltip="sliderDefaultLabel"
        @click="write(null)"
      />
    </template>
    <UiDropdown v-else :model-value="selectValue" :aria-label="label" @update:model-value="writeSelect">
      <option v-for="choice of choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>

<style scoped>
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
