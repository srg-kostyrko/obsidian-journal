<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";

import { ReloadHintService } from "../reload-hint";

import { SettingsUiService } from "./settings-ui-service";

const ui = useService(SettingsUiService);
const reloadHint = useService(ReloadHintService);
const current = computed(() => ui.current.value);
const nav = {
  back: () => ui.pop(),
  push: ui.push.bind(ui),
};
</script>

<template>
  <div v-if="current === null" class="journal-settings-dashboard">
    <div v-if="reloadHint.pending.value" class="journal-reload-banner">
      {{ m.settings_reload_required_banner() }}
    </div>
    <component :is="block.component" v-for="block in ui.blocks" :key="block.key" />
  </div>
  <component :is="current.subpage.component" v-else v-bind="current.props as Record<string, unknown>" :nav="nav" />
</template>

<style scoped>
.journal-reload-banner {
  padding: var(--size-4-2) var(--size-4-3);
  margin-bottom: var(--size-4-3);
  border-radius: var(--radius-s);
  background-color: var(--background-modifier-message);
  color: var(--text-warning);
}
</style>
