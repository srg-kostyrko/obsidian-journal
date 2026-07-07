<script setup lang="ts">
import { ref, type Component } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const props = defineProps<{
  component: Component;
  config: Record<string, unknown>;
  // Consumed by the modal title (see modals.ts), declared here so they are not fall-through attrs.
  typeLabel?: string;
  summary?: string;
}>();

const api = useModal<Record<string, unknown>>();
const working = ref<Record<string, unknown>>(props.config);
</script>

<template>
  <component :is="props.component" :config="working" :on-change="(next: Record<string, unknown>) => (working = next)" />
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta @click="api.submit(working)">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>
