<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const api = useModal();
</script>

<template>
  <div>
    <UiSettingRow>
      <template #description>{{ m.tasks_move_block_link_warning() }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="api.submit()">{{ m.tasks_move_block_link_confirm() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
