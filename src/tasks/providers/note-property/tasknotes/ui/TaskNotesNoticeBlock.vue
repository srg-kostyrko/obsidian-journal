<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { manual } from "@/ui/manual";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { notePropertySlice } from "../../slice";
import { SetUpFromTaskNotesFlow } from "../flows/set-up-from-tasknotes.flow";
import { taskNotesNoticeSlice } from "../slice";
import { TaskNotesSource, type TaskNotesRead } from "../source";

const source = useService(TaskNotesSource);
const flows = useService(Flows);
const settings = useService(SettingsService);
const notice = settings.getSlice(taskNotesNoticeSlice);
const provider = settings.getSlice(notePropertySlice);

// Read at setup and after Set up, not continuously: another plugin's settings are not reactive.
// A dismissed or already set-up card reads nothing: TaskNotes' getter is foreign code on every dashboard open.
function offered(): boolean {
  return !notice.state.dismissed && !provider.state.enabled && !provider.state.setUp;
}
const read = ref<TaskNotesRead | undefined>(offered() ? source.read() : undefined);
function refresh(): void {
  read.value = offered() ? source.read() : undefined;
}

const visible = computed(() => offered() && read.value?.kind === "read");

async function setUp(): Promise<void> {
  await flows.invoke(SetUpFromTaskNotesFlow, {});
  refresh();
}

function dismiss(): void {
  notice.state = { dismissed: true };
}
</script>

<template>
  <div v-if="visible" class="tasknotes-notice">
    <UiSettingRow heading :name="m.tasks_tasknotes_notice_heading()" :help="manual.tasks.taskNotesSetUp" />
    <UiSettingRow>
      <template #description>{{ m.tasks_tasknotes_notice_message() }}</template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="dismiss">{{ m.tasks_tasknotes_notice_dismiss() }}</UiButton>
      <UiButton cta @click="setUp">{{ m.tasks_tasknotes_notice_set_up() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
/* Same card as the import notice: Obsidian fills and rounds every .setting-item itself, so the rows
   are flattened or the card reads as a container of three separate things. */
.tasknotes-notice {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-inline-start: 3px solid var(--interactive-accent);
  border-radius: var(--radius-m);
  padding: var(--size-4-3) var(--size-4-4);
  margin-block-end: var(--size-4-5);
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
/* Obsidian's own bottom margin on settings rows would stack on the gap above. */
.tasknotes-notice :deep(.setting-item) {
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  border-radius: 0;
}
</style>
