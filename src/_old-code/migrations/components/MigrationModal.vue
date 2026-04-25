<script setup lang="ts">
import { usePlugin } from "@/composables/use-plugin";
import type { PendingMigration } from "@/types/migration.types";
import { computed, onMounted, ref } from "vue";
import V2Migration from "./v1-v2/v2-migration.vue";

const emit = defineEmits<{
  close: [];
}>();

const plugin = usePlugin();
const currentMigration = ref<PendingMigration | null>(null);

const migrationComponent = computed(() => {
  if (!currentMigration.value) return null;
  switch (currentMigration.value.type) {
    case "v1-v2": {
      return V2Migration;
    }
  }
  return null;
});

function onFinished() {
  currentMigration.value = null;
  plugin.pendingMigrations.shift();
  const nextMigration = plugin.pendingMigrations[0];
  if (nextMigration) currentMigration.value = nextMigration;
  else emit("close");
}

onMounted(() => {
  const nextMigration = plugin.pendingMigrations[0];
  if (nextMigration) currentMigration.value = nextMigration;
  else emit("close");
});
</script>

<template>
  <div v-if="currentMigration">
    <component :is="migrationComponent" :migration="currentMigration" @finished="onFinished" />
  </div>
</template>

<style scoped></style>
