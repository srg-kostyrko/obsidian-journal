<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ viewName: string }>();

const api = useModal();
</script>

<template>
  <div>
    <UiSettingRow>
      <template #description>{{ m.view_delete_modal_description() }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta warning @click="api.submit()">{{ m.common_action_delete() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
