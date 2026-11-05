<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { isModified, valueAt, visibleControls, withReset } from "../appearance-editing";
import { PARTS, type PartKey, type Width } from "../appearance-parts";
import { appearanceSlice, type HighlightStyle } from "../slice";

import AppearanceControl from "./AppearanceControl.vue";
import AppearancePreview from "./AppearancePreview.vue";

const { nav } = defineProps<{ nav: SubpageNav }>();

const slice = useService(SettingsService).getSlice(appearanceSlice);

// Reading order of the calendar, top to bottom, rather than the chips' most-specific-first order.
const LIST_ORDER: readonly PartKey[] = [
  "heading",
  "weekday",
  "weekNumber",
  "date",
  "today",
  "selected",
  "active",
  "outside",
  "cell",
];

const width = ref<Width>("wide");
const widthOptions = computed(() =>
  (["narrow", "wide"] as const).map((value) => ({ value, label: m.calendar_appearance_width({ width: value }) })),
);

const selected = ref<PartKey | undefined>(undefined);
const chips = ref<readonly PartKey[]>([]);

function isPart(value: string): value is PartKey {
  return Object.hasOwn(PARTS, value);
}
function onPick(parts: readonly PartKey[]): void {
  chips.value = parts;
  selected.value = parts.at(0);
}
function onList(value: string): void {
  selected.value = isPart(value) ? value : undefined;
  chips.value = [];
}

const partName = (part: PartKey): string => m.calendar_appearance_part({ part });
const modified = (part: PartKey): boolean => isModified(slice.state, width.value, part);

const inspected = computed(() => {
  const part = selected.value;
  if (part === undefined) return;
  const { family } = PARTS[part];
  const style =
    family === "highlight" ? (valueAt(slice.state, width.value, part, ["style"]) as HighlightStyle) : undefined;
  return { part, family, controls: visibleControls(part, style) };
});

function reset(part: PartKey): void {
  slice.state = withReset(slice.state, width.value, part);
}
</script>

<template>
  <UiBackLink @click="nav.back()" />
  <UiSettingRow heading no-controls>
    <template #name>
      <UiIconedRow :icon="icons.section.appearance">{{ m.calendar_appearance_section_title() }}</UiIconedRow>
    </template>
  </UiSettingRow>
  <UiSettingRow :name="m.calendar_appearance_width_label()">
    <template #description>{{ m.calendar_appearance_editing({ width }) }}</template>
    <UiSegmentedControl v-model="width" :options="widthOptions" />
  </UiSettingRow>
  <!-- Above the inspector, not beside it: the settings pane cannot fit the wide preview and a column. -->
  <div class="appearance-subpage__preview">
    <AppearancePreview :width="width" @pick="onPick" />
  </div>
  <UiSettingRow :name="m.calendar_appearance_part_label()">
    <template v-if="!inspected" #description>{{ m.calendar_appearance_part_hint() }}</template>
    <UiDropdown
      :model-value="selected ?? ''"
      :aria-label="m.calendar_appearance_part_label()"
      @update:model-value="onList"
    >
      <option value="">{{ m.calendar_appearance_part_placeholder() }}</option>
      <!-- An option holds text only, so the dot is the visible marker and the label carries the word. -->
      <option
        v-for="part of LIST_ORDER"
        :key="part"
        :value="part"
        :aria-label="modified(part) ? `${partName(part)} (${m.calendar_appearance_modified()})` : undefined"
      >
        {{ modified(part) ? `${partName(part)} •` : partName(part) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow v-if="chips.length > 1" stacked :name="m.calendar_appearance_parts_here()">
    <div class="appearance-subpage__chips" role="group" :aria-label="m.calendar_appearance_parts_here()">
      <button
        v-for="part of chips"
        :key="part"
        type="button"
        class="appearance-subpage__chip"
        :class="{ 'is-active': part === selected, 'is-modified': modified(part) }"
        :aria-pressed="part === selected"
        @click="selected = part"
      >
        {{ partName(part) }}
        <template v-if="modified(part)">
          <span class="appearance-subpage__marker" aria-hidden="true">•</span>
          <span class="appearance-subpage__hidden">{{ m.calendar_appearance_modified() }}</span>
        </template>
      </button>
    </div>
  </UiSettingRow>
  <template v-if="inspected">
    <UiSettingRow heading no-controls :name="m.calendar_appearance_family({ family: inspected.family })" />
    <AppearanceControl
      v-for="control of inspected.controls"
      :key="`${inspected.part}.${control.path.join('.')}`"
      :part="inspected.part"
      :control="control"
      :width="width"
    />
    <UiSettingRow controls-only>
      <UiButton :disabled="!modified(inspected.part)" @click="reset(inspected.part)">
        {{ m.calendar_appearance_reset({ width }) }}
      </UiButton>
    </UiSettingRow>
  </template>
</template>

<style scoped>
.appearance-subpage__preview {
  overflow-x: auto;
  padding-block: var(--size-4-2);
}
.appearance-subpage__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-1);
}
.appearance-subpage__chip {
  height: auto;
  padding: var(--size-2-1) var(--size-4-2);
  border-radius: var(--radius-l);
  font-size: var(--font-ui-small);
}
.appearance-subpage__chip.is-active {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.appearance-subpage__hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.appearance-subpage__marker {
  margin-inline-start: var(--size-2-1);
  color: var(--text-accent);
}
.appearance-subpage__chip.is-active .appearance-subpage__marker {
  color: inherit;
}
</style>
