<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ location: string }>();

const api = useModal();
</script>

<template>
  <div>
    <UiSettingRow>
      <template #description>{{ m.view_reposition_modal_description({ location }) }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="api.submit()">{{ m.view_reposition_modal_confirm() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
