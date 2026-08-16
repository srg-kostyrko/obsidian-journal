<script setup lang="ts">
import { computed, ref } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { journalDefaultsFor } from "@/journals/config";
import { JournalsViewModel } from "@/journals/view-model";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { applySegmentReorder } from "../../line-reorder";
import { periodForJournal } from "../../period-for-journal";
import NavBlock from "../../ui/NavBlock.vue";
import { EditNavBlockSegmentFlow } from "../flows/edit-nav-segment.flow";

import NavBlockLineDropZone from "./NavBlockLineDropZone.vue";
import NavBlockLineGutter from "./NavBlockLineGutter.vue";

const {
  journalName,
  field,
  title,
  icon,
  mode = false,
  useDefaults = false,
} = defineProps<{
  journalName: string;
  field: "navBlock" | "intervalBlock";
  title: string;
  icon: string;
  mode?: boolean;
  useDefaults?: boolean;
}>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);

const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());
const expanded = ref(false);

const todayAnchor = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);
const previewPeriod = computed(() =>
  config.value ? periodForJournal(config.value.write, todayAnchor.value) : undefined,
);

function applyDefaults(): void {
  if (!config.value) return;
  config.value[field].lines = journalDefaultsFor(config.value.write, config.value.name)[field].lines;
}

function add(): void {
  void flows.invoke(EditNavBlockSegmentFlow, { journalName, field });
}
function addSegment(lineIndex: number): void {
  void flows.invoke(EditNavBlockSegmentFlow, { journalName, field, lineIndex });
}
function editSegment(lineIndex: number, segmentIndex: number): void {
  void flows.invoke(EditNavBlockSegmentFlow, { journalName, field, lineIndex, segmentIndex });
}
function removeLine(lineIndex: number): void {
  config.value?.[field].lines.splice(lineIndex, 1);
}
function moveUp(lineIndex: number): void {
  const lines = config.value?.[field].lines;
  if (!lines || lineIndex <= 0) return;
  [lines[lineIndex - 1], lines[lineIndex]] = [lines[lineIndex], lines[lineIndex - 1]];
}
function moveDown(lineIndex: number): void {
  const lines = config.value?.[field].lines;
  if (!lines || lineIndex >= lines.length - 1) return;
  [lines[lineIndex], lines[lineIndex + 1]] = [lines[lineIndex + 1], lines[lineIndex]];
}

// Unique per rendered block so dragging never crosses from, say, navBlock into intervalBlock,
// or between two journals' editors open on the same page.
const dragGroup = computed(() => `nav-lines:${journalName}:${field}`);

// Each line owns its own dragging flag (only the drag's source line ever reports true), so
// the drop zones need the OR of all of them — a counter rather than a boolean survives two
// lines' start/end events landing out of the order a single drag would produce.
const dragCount = ref(0);
const anyDragging = computed(() => dragCount.value > 0);
function onDragStart(): void {
  dragCount.value += 1;
}
function onDragEnd(): void {
  dragCount.value = Math.max(0, dragCount.value - 1);
}

function reorderSegments(targetLine: number, orderedIds: string[]): void {
  if (!config.value) return;
  config.value[field].lines = applySegmentReorder(config.value[field].lines, targetLine, orderedIds);
}

// The only drop zone that isn't paired with an "afterLine" line index — it sits above the first
// line, the one gap #afterLine can never reach, so a segment can split off into a new first line.
function onDropAtStart(orderedIds: string[]): void {
  reorderSegments(0, orderedIds);
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icon">
        {{ title }}
        <span class="flair">{{ config[field].lines.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.add" :tooltip="m.block_lines_add_line()" @click="add" />
    </template>

    <UiSettingRow v-if="mode" :name="m.nav_block_section_mode_label()">
      <UiDropdown v-model="config[field].type">
        <option value="create">{{ m.nav_block_section_mode_option({ kind: "create" }) }}</option>
        <option value="existing">{{ m.nav_block_section_mode_option({ kind: "existing" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.block_lines_decorate_whole_label()">
      <UiToggle v-model="config[field].decorateWholeBlock" />
    </UiSettingRow>

    <UiSettingRow v-if="useDefaults && config[field].lines.length === 0" controls-only>
      <UiButton @click="applyDefaults">
        {{ m.nav_block_section_use_defaults({ writeType: config.write.type }) }}
      </UiButton>
    </UiSettingRow>

    <UiSettingRow v-if="config[field].lines.length === 0" no-controls>
      <template #description>{{ m.block_lines_empty() }}</template>
    </UiSettingRow>

    <div v-else class="nav-block-preview">
      <NavBlock
        :block="config[field]"
        :journal="config"
        :ref-date="todayAnchor"
        :period="previewPeriod!"
        editable
        @edit="editSegment"
      >
        <template #beforeLines>
          <NavBlockLineDropZone :target-line="0" :showing="anyDragging" :group="dragGroup" @drop="onDropAtStart" />
        </template>
        <template #lineAction="{ index, isFirst, isLast, lineEl }">
          <NavBlockLineGutter
            :line-index="index"
            :segment-count="config[field].lines[index]?.length ?? 0"
            :is-first="isFirst"
            :is-last="isLast"
            :group="dragGroup"
            :line-el="lineEl"
            @move-up="moveUp(index)"
            @move-down="moveDown(index)"
            @add-segment="addSegment(index)"
            @remove-line="removeLine(index)"
            @reorder="(orderedIds) => reorderSegments(index, orderedIds)"
            @drag-start="onDragStart"
            @drag-end="onDragEnd"
          />
        </template>
        <template #afterLine="{ index }">
          <NavBlockLineDropZone
            :target-line="index + 1"
            :showing="anyDragging"
            :group="dragGroup"
            @drop="(orderedIds) => reorderSegments(index + 1, orderedIds)"
          />
        </template>
      </NavBlock>
    </div>
  </UiCollapsibleBlock>
</template>

<style scoped>
.nav-block-preview {
  padding: var(--size-4-2) 0;
}
/* Decorated blocks wrap rows in a centered, shrink-wrapped CellDecoration; stretch it so the
   action gutter reaches the row edge instead of bunching after the centered preview text. */
.nav-block-preview :deep(.nav-block-inner > .cell-decoration__content) {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}
.nav-block-preview :deep(.nav-block-line) {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
  padding-block: var(--size-2-3);
}
.nav-block-preview :deep(.nav-row) {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
