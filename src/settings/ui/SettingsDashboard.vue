<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";

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
    <component :is="block.component" v-for="block in ui.blocks" :key="block.key" />
  </div>
  <component :is="current.subpage.component" v-else v-bind="current.props as Record<string, unknown>" :nav="nav" />
</template>
