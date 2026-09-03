<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref } from "vue";

import { Calendar } from "@/calendar";
import {
  DecorationMatchService,
  DecorationPreview,
  DecorationsStore,
  type DecorationOwner,
  type JournalDecoration,
  type MatchBadge,
} from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { useModalService } from "@/infrastructure/host/modals";
import { JournalsRepository } from "@/journals";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { decorationBreakdownModal } from "../../ui/modals";
import { DeleteDecorationFlow } from "../flows/delete-decoration.flow";
import { EditDecorationFlow } from "../flows/edit-decoration.flow";

import { describeCondition } from "./describe-condition";

const { owner } = defineProps<{ owner: DecorationOwner }>();

const flows = useService(Flows);
const store = useService(DecorationsStore);
const calendar = useService(Calendar);
const matches = useService(DecorationMatchService);
const modals = useModalService();
const journals = useService(JournalsRepository);

function typeName(id: string): string | undefined {
  return owner.kind === "journal" ? journals.get(owner.journalName).getOrUndefined()?.notelets[id]?.name : undefined;
}

const decorations = computed<readonly JournalDecoration[]>(() => store.list(owner));

// Memoized per section mount rather than per render: JournalsIndex is not Vue-reactive, so
// reading useIndexVersion() here would invalidate every badge on every index change (a note
// created, renamed, or deleted anywhere) and re-run up to 20 decorations × 90 evaluations each
// time. Recomputing only when the decorations list changes means an edited rule gets a fresh
// badge, but a badge does not refresh when a note is created while the section stays open —
// that staleness is the deliberate cost trade-off, not an oversight.
const badges = computed<readonly MatchBadge[]>(() =>
  decorations.value.map((_, index) => matches.describe(owner, index)),
);

function badgeText(badge: MatchBadge): string | null {
  return match(badge)
    .with({ kind: "matched", direction: "past" }, (b) =>
      m.decoration_badge_matched_past({ matched: b.matched, total: b.total, unit: b.unit }),
    )
    .with({ kind: "matched", direction: "future" }, (b) =>
      m.decoration_badge_matched_future({ matched: b.matched, total: b.total, unit: b.unit }),
    )
    .with({ kind: "silent", direction: "past" }, (b) =>
      m.decoration_badge_silent_past({ total: b.total, unit: b.unit }),
    )
    .with({ kind: "silent", direction: "future" }, (b) =>
      m.decoration_badge_silent_future({ total: b.total, unit: b.unit }),
    )
    .with({ kind: "no-history" }, () => m.decoration_badge_no_history())
    .with({ kind: "no-notes" }, () => m.decoration_badge_no_notes())
    .with({ kind: "not-previewable" }, () => null)
    .exhaustive();
}

const badgeTexts = computed<readonly (string | null)[]>(() => badges.value.map(badgeText));

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

function inspect(): void {
  void modals.open(decorationBreakdownModal, {});
}
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
      <UiIconedRow :icon="icons.section.decorations">
        {{ title }}
        <span class="flair">{{ decorations.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.search" :tooltip="m.decoration_breakdown_open()" @click="inspect" />
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
            <span>{{ describeCondition(condition, calendar, typeName) }}</span>
          </template>
        </div>
        <div v-if="badgeTexts[index]" class="row-badge">{{ badgeTexts[index] }}</div>
      </template>
      <UiIconButton :icon="icons.action.configure" :tooltip="m.decoration_edit()" @click="edit(index)" />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.decoration_delete()" @click="remove(index)" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
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
.row-badge {
  display: block;
  margin-top: var(--size-2-1);
  color: var(--text-muted);
  font-size: 85%;
}
</style>
