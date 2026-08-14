<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const api = useModal<{ confirmed: true }>();

function confirm(): void {
  api.submit({ confirmed: true });
}
</script>

<template>
  <UiSettingRow no-controls>
    <template #description>{{ m.decoration_delete_modal_warning() }}</template>
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta warning @click="confirm">{{ m.common_action_delete() }}</UiButton>
  </UiSettingRow>
</template>
