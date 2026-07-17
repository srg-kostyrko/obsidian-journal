<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsIndex } from "../../journals-index";

const props = defineProps<{ journalName: string }>();

const api = useModal<{ mode: "keep" | "clear" | "delete" }>();
const mode = ref<"keep" | "clear" | "delete">("keep");

// The most destructive action in the plugin asked the user to accept "all notes connected to
// this journal" sight unseen. The index knows exactly which notes those are — it is the same
// set the operation walks — so the number is stated rather than left to be guessed.
const index = useService(JournalsIndex);
const connectedCount = computed(() => [...index.entriesFor(props.journalName)].length);

function submit(): void {
  api.submit({ mode: mode.value });
}
</script>

<template>
  <UiSettingRow no-controls :name="m.journal_delete_connected_count({ count: connectedCount })" />
  <UiSettingRow :name="m.journal_delete_mode_label()">
    <template #description>{{ m.journal_delete_mode_description({ mode }) }}</template>
    <UiDropdown v-model="mode">
      <option value="keep">{{ m.journal_delete_mode_option({ mode: "keep" }) }}</option>
      <option value="clear">{{ m.journal_delete_mode_option({ mode: "clear" }) }}</option>
      <option value="delete">{{ m.journal_delete_mode_option({ mode: "delete" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta warning @click="submit">{{ m.common_action_delete() }}</UiButton>
  </UiSettingRow>
</template>
