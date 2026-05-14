<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";

import DashboardBlock from "./DashboardBlock.vue";
import { SettingsUiService } from "./settings-ui-service";

const ui = useService(SettingsUiService);
const current = computed(() => ui.current.value);
const nav = {
  back: () => ui.pop(),
  push: ui.push.bind(ui),
};
</script>

<template>
  <div v-if="current === null" class="journal-settings-dashboard">
    <DashboardBlock v-for="block in ui.blocks" :key="block.key" :component="block.component" />
  </div>
  <component :is="current.subpage.component" v-else v-bind="current.props as Record<string, unknown>" :nav="nav" />
</template>
