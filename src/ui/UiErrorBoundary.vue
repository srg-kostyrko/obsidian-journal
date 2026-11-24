<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

const logger = useService(LoggerFactoryToken).named("settings");
const failure = ref<string | null>(null);

// Dev builds pass "setup function" / "render function"; production passes a URL ending in the
// error code (0 and 1). Handler, watcher and hook errors must reach the app's own handler.
const CONTAINED = /^(setup function|render function)$|#runtime-[01]$/;

onErrorCaptured((error, _instance, info) => {
  if (!CONTAINED.test(info)) return;
  const reason = error instanceof Error ? error.message : String(error);
  failure.value = reason;
  logger.error("a settings section failed to render", { reason, error });
  return false;
});
</script>

<template>
  <div v-if="failure !== null" class="journal-section-failed">
    {{ m.settings_section_failed({ reason: failure }) }}
  </div>
  <slot v-else />
</template>

<style scoped>
.journal-section-failed {
  padding: var(--size-4-2) var(--size-4-3);
  margin-bottom: var(--size-4-3);
  border-radius: var(--radius-s);
  background-color: var(--background-modifier-message);
  color: var(--text-error);
}
</style>
