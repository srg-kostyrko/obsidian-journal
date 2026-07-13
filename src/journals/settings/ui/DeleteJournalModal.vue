<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ journalName: string }>();

const api = useModal<{ mode: "keep" | "clear" | "delete" }>();
const mode = ref<"keep" | "clear" | "delete">("keep");

function submit(): void {
  api.submit({ mode: mode.value });
}
</script>

<template>
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
