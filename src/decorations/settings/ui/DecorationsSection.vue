<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref } from "vue";

import { Calendar } from "@/calendar";
import { DecorationPreview, DecorationsStore, type DecorationOwner, type JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DeleteDecorationFlow } from "../flows/delete-decoration.flow";
import { EditDecorationFlow } from "../flows/edit-decoration.flow";

import { describeCondition } from "./describe-condition";

const { owner } = defineProps<{ owner: DecorationOwner }>();

const flows = useService(Flows);
const store = useService(DecorationsStore);
const calendar = useService(Calendar);

const decorations = computed<readonly JournalDecoration[]>(() => store.list(owner));

const title = computed(() =>
  match(owner)
    .with({ kind: "journal" }, () => m.decoration_section_title_journal())
    .with({ kind: "shelf" }, () => m.decoration_section_title_shelf())
    .with({ kind: "global" }, () => m.decoration_section_title_calendar())
    .exhaustive(),
);

const description = computed(() =>
  match(owner)
    .with({ kind: "journal" }, () => m.decoration_section_description_journal())
    .with({ kind: "shelf" }, () => m.decoration_section_description_shelf())
    .with({ kind: "global" }, () => m.decoration_section_description_calendar())
    .exhaustive(),
);

const expanded = ref(false);
const previewDay = new Date().getDate();

function add(): void {
  void flows.invoke(EditDecorationFlow, { owner });
}
function edit(index: number): void {
  void flows.invoke(EditDecorationFlow, { owner, index });
}
function remove(index: number): void {
  void flows.invoke(DeleteDecorationFlow, { owner, index });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="journal-section-heading">
        <UiIcon :name="icons.section.decorations" />
        <span>{{ title }}</span>
        <span class="flair">{{ decorations.length }}</span>
      </span>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.add" :tooltip="m.decoration_add()" @click="add" />
    </template>

    <UiSettingRow no-controls>
      <template #description>{{ description }}</template>
    </UiSettingRow>

    <UiSettingRow v-if="decorations.length === 0" no-controls>
      <template #description>{{ m.decoration_section_empty() }}</template>
    </UiSettingRow>

    <UiSettingRow v-for="(decoration, index) of decorations" :key="index">
      <template #description>
        <div class="row-preview">
          <DecorationPreview :styles="decoration.styles">{{ previewDay }}</DecorationPreview>
        </div>
        <div class="row-clauses">
          <span>{{ m.decoration_describe_when() }}</span>
          <template v-for="(condition, i) of decoration.conditions" :key="i">
            <span v-if="i > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: decoration.mode }) }}</span>
            <span>{{ describeCondition(condition, calendar) }}</span>
          </template>
        </div>
      </template>
      <UiIconButton :icon="icons.action.configure" :tooltip="m.decoration_edit()" @click="edit(index)" />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.decoration_delete()" @click="remove(index)" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.row-preview {
  display: inline-block;
  min-width: 2em;
  min-height: 2em;
  margin-right: var(--size-4-2);
  vertical-align: middle;
}
.row-clauses {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--size-2-2);
  align-items: baseline;
}
.mode-word {
  text-transform: uppercase;
  font-size: 75%;
}
</style>
