<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

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
  replace: ui.replace.bind(ui),
};

const root = ref<HTMLElement | null>(null);
const offsets: number[] = [];

// Vue mounts into the settings pane, so that pane is the scroll container and swapping the
// subpage under it leaves scrollTop untouched: a subpage opened from a scrolled dashboard
// starts mid-page, its back link above the fold. The watcher runs before the DOM updates, so
// scrollTop still reads the outgoing page's offset — worth remembering before it is gone.
watch(
  () => ui.depth.value,
  async (next, previous) => {
    const scroller = root.value?.parentElement;
    if (!scroller) return;
    if (next > previous) offsets[previous] = scroller.scrollTop;
    await nextTick();
    scroller.scrollTop = next > previous ? 0 : (offsets[next] ?? 0);
  },
);
</script>

<template>
  <div ref="root">
    <div v-if="current === null" class="journal-settings-dashboard">
      <div v-if="reloadHint.pending.value" class="journal-reload-banner">
        {{ m.settings_reload_required_banner() }}
      </div>
      <component :is="block.component" v-for="block in ui.blocks" :key="block.key" />
    </div>
    <component :is="current.subpage.component" v-else v-bind="current.props as Record<string, unknown>" :nav="nav" />
  </div>
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
