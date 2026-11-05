<script setup lang="ts">
import { computed, provide, ref, useId, useTemplateRef } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { isModified, valueAt, visibleControls, withReset } from "../appearance-editing";
import { PARTS, type PartKey, type Width } from "../appearance-parts";
import { appearanceSlice, type HighlightStyle } from "../slice";

import AppearanceControl from "./AppearanceControl.vue";
import AppearancePreview from "./AppearancePreview.vue";
import { AppearancePreviewRootKey } from "./preview-root-key";

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

const preview = useTemplateRef<InstanceType<typeof AppearancePreview>>("preview");
provide(
  AppearancePreviewRootKey,
  computed(() => preview.value?.root),
);
const widthOptions = computed(() =>
  (["narrow", "wide"] as const).map((value) => ({ value, label: m.calendar_appearance_width({ width: value }) })),
);

const selected = ref<PartKey | undefined>(undefined);
const chips = ref<readonly PartKey[]>([]);
// An "also here" chip keeps the spot, since its parts are the ones there; the list names no spot.
const spot = ref<string | undefined>(undefined);

function isPart(value: string): value is PartKey {
  return Object.hasOwn(PARTS, value);
}
function onPick(parts: readonly PartKey[], at: string | undefined): void {
  chips.value = parts;
  spot.value = at;
  selected.value = parts.at(0);
}
function onList(value: string): void {
  selected.value = isPart(value) ? value : undefined;
  chips.value = [];
  spot.value = undefined;
}

const others = computed(() => chips.value.filter((part) => part !== selected.value));
const listId = useId();
const othersId = useId();

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

// Keyed by part, so collapsing a family on one part leaves the same family open on the next.
const collapsed = ref(new Set<string>());
const familyKey = (part: PartKey, family: string): string => `${part}.${family}`;
const familyOpen = (part: PartKey, family: string): boolean => !collapsed.value.has(familyKey(part, family));
function setFamilyOpen(part: PartKey, family: string, open: boolean): void {
  const next = new Set(collapsed.value);
  if (open) next.delete(familyKey(part, family));
  else next.add(familyKey(part, family));
  collapsed.value = next;
}

function reset(part: PartKey): void {
  slice.state = withReset(slice.state, width.value, part);
}
</script>

<template>
  <UiBackLink @click="nav.back()" />
  <UiSettingRow heading no-controls :help="manual.view.appearance">
    <template #name>
      <UiIconedRow :icon="icons.section.appearance">{{ m.calendar_appearance_section_title() }}</UiIconedRow>
    </template>
  </UiSettingRow>
  <!-- Above the inspector, not beside it: the settings pane cannot fit the wide preview and a column. -->
  <section class="appearance-subpage__panel">
    <div class="appearance-subpage__panel-head">
      <div class="appearance-subpage__panel-heading">
        <span class="appearance-subpage__panel-title">{{ m.calendar_appearance_preview() }}</span>
        <span class="appearance-subpage__panel-hint">{{ m.calendar_appearance_part_hint() }}</span>
      </div>
      <UiSegmentedControl v-model="width" :options="widthOptions" :aria-label="m.calendar_appearance_width_label()" />
    </div>
    <div class="appearance-subpage__stage">
      <!-- Wide keeps a floor above the breakpoint, so a pane narrower than that scrolls here, not the page. -->
      <div class="appearance-subpage__scroller">
        <div class="appearance-subpage__frame" :class="{ 'appearance-subpage__frame--fill': width === 'wide' }">
          <AppearancePreview ref="preview" :width="width" :picked="selected" :spot="spot" @pick="onPick" />
        </div>
      </div>
      <p class="appearance-subpage__caption">{{ m.calendar_appearance_editing({ width }) }}</p>
    </div>
    <div class="appearance-subpage__selection">
      <div class="appearance-subpage__line">
        <label class="appearance-subpage__label" :for="listId">{{ m.calendar_appearance_part_label() }}</label>
        <UiDropdown :id="listId" :model-value="selected ?? ''" @update:model-value="onList">
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
      </div>
      <div v-if="others.length > 0" class="appearance-subpage__line" role="group" :aria-labelledby="othersId">
        <span :id="othersId" class="appearance-subpage__label">{{ m.calendar_appearance_also_here() }}</span>
        <button
          v-for="part of others"
          :key="part"
          type="button"
          class="appearance-subpage__chip"
          :class="{ 'is-modified': modified(part) }"
          @click="selected = part"
        >
          {{ partName(part) }}
          <template v-if="modified(part)">
            <span class="appearance-subpage__marker" aria-hidden="true">•</span>
            <span class="appearance-subpage__hidden">{{ m.calendar_appearance_modified() }}</span>
          </template>
        </button>
      </div>
    </div>
  </section>
  <template v-if="inspected">
    <UiSettingRow heading class="appearance-subpage__inspector">
      <template #name>
        {{ partName(inspected.part) }}
        <span class="appearance-subpage__scope">{{ m.calendar_appearance_scope({ width }) }}</span>
      </template>
      <UiButton :disabled="!modified(inspected.part)" @click="reset(inspected.part)">
        {{ m.calendar_appearance_reset({ width }) }}
      </UiButton>
    </UiSettingRow>
    <UiCollapsibleBlock
      class="appearance-subpage__family"
      :expanded="familyOpen(inspected.part, inspected.family)"
      @update:expanded="setFamilyOpen(inspected.part, inspected.family, $event === true)"
    >
      <template #trigger>{{ m.calendar_appearance_family({ family: inspected.family }) }}</template>
      <AppearanceControl
        v-for="control of inspected.controls"
        :key="`${inspected.part}.${control.path.join('.')}`"
        :part="inspected.part"
        :control="control"
        :width="width"
      />
    </UiCollapsibleBlock>
  </template>
</template>

<style scoped>
.appearance-subpage__panel {
  margin-block: var(--size-4-3);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background-color: var(--background-secondary);
  overflow: hidden;
}
.appearance-subpage__panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--size-4-3);
  padding: var(--size-4-2) var(--size-4-3);
  border-bottom: 1px solid var(--background-modifier-border);
}
.appearance-subpage__panel-heading {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-1);
  min-width: 0;
}
.appearance-subpage__panel-title {
  font-size: var(--font-ui-small);
  font-weight: var(--font-semibold);
}
/* Read before the preview, not after it: placed under the calendar, the hint went unnoticed. */
.appearance-subpage__panel-hint {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
}
.appearance-subpage__stage {
  padding: var(--size-4-4) var(--size-4-3) var(--size-4-3);
  background-color: var(--background-primary);
}
.appearance-subpage__scroller {
  overflow-x: auto;
}
/* Auto margins rather than flex centering: a frame wider than the stage then overflows to the
   scrollable side instead of past the left edge, where no scrollbar reaches. */
.appearance-subpage__frame {
  width: fit-content;
  margin-inline: auto;
  padding: var(--size-4-2);
  border: 1px dashed var(--background-modifier-border);
  border-radius: var(--radius-m);
}
.appearance-subpage__frame--fill {
  width: auto;
}
.appearance-subpage__caption {
  margin: var(--size-4-2) 0 0;
  text-align: center;
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
}
.appearance-subpage__selection {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
  padding: var(--size-4-2) var(--size-4-3);
  border-top: 1px solid var(--background-modifier-border);
}
.appearance-subpage__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-4-1) var(--size-4-2);
}
.appearance-subpage__label {
  min-width: 5em;
  font-size: var(--font-ui-small);
  color: var(--text-muted);
}
.appearance-subpage__chip {
  height: auto;
  padding: var(--size-2-1) var(--size-4-2);
  border-radius: var(--radius-l);
  font-size: var(--font-ui-small);
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
.appearance-subpage__scope {
  margin-inline-start: var(--size-4-2);
  font-size: var(--font-ui-small);
  font-weight: var(--font-normal);
  color: var(--text-muted);
}
/* A subsection under the part's own heading, so it steps down rather than repeating its weight. */
.appearance-subpage__family :deep(.collapsible-trigger-text) {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
}
</style>
