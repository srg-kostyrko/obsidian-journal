<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { JournalsRepository } from "@/journals/repository";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { effectiveMove, moveDefaultsSlice, type EffectiveMove } from "../settings";

import { editJournalMoveModal } from "./modals";

const { journalName } = defineProps<{ journalName: string }>();

const modals = useModalService();
const journals = useService(JournalsRepository);
const defaults = useService(SettingsService).getSlice(moveDefaultsSlice);

function actionOf(effective: EffectiveMove): "move" | "copy-stamp" | "copy" {
  if (effective.mode === "move") return "move";
  return effective.stamp ? "copy-stamp" : "copy";
}

const move = computed(() => journals.get(journalName).getOrUndefined()?.tasks.move);

const summary = computed(() => {
  const stored = move.value;
  if (stored === undefined) return [];
  const effective = effectiveMove(stored, defaults.state);
  return [
    m.tasks_move_summary({ action: actionOf(effective), count: effective.lookBack }),
    m.tasks_move_summary_source({ source: effective.source }),
    ...(effective.targetHeading === "" ? [] : [m.tasks_move_summary_heading({ heading: effective.targetHeading })]),
  ];
});

function edit(): void {
  const current = move.value;
  if (current === undefined) return;
  void modals.open(editJournalMoveModal, { move: current }).tap((next) => {
    // Re-read across the modal's lifetime: a sync merge or any other write can change the journal
    // while it is open, and only the move block is this modal's to replace.
    const config = journals.get(journalName);
    if (config.isNone()) return;
    journals.update(journalName, { tasks: { ...config.value.tasks, move: next } });
  });
}
</script>

<template>
  <UiSettingRow :name="m.tasks_move_title()">
    <template #description>
      <span data-testid="move-summary">{{ summary.join(" ") }}</span>
    </template>
    <UiButton @click="edit">{{ m.tasks_move_edit() }}</UiButton>
  </UiSettingRow>
</template>
