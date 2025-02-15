<script setup lang="ts">
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import type { IntervalConfig } from "@/types/old-settings.types";
import { onMounted, ref } from "vue";
import { migrateIntervalJournal } from "./v1-v2";
import { usePlugin } from "@/composables/use-plugin";
import ObsidianIcon from "@/components/obsidian/ObsidianIcon.vue";
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";

const { journal, keepFrontmatter } = defineProps<{
  journal: IntervalConfig;
  keepFrontmatter: boolean;
}>();
const emit = defineEmits<{ next: []; finished: [] }>();

const plugin = usePlugin();
const is_processing = ref(true);

onMounted(async () => {
  is_processing.value = true;
  await migrateIntervalJournal(plugin, journal, keepFrontmatter);
  emit("finished");
  is_processing.value = false;
});
</script>

<template>
  <div>
    <ObsidianSetting heading>
      <template #name> Migrating {{ journal.name }} </template>
    </ObsidianSetting>
    <div v-if="is_processing" class="loader-continer">
      <ObsidianIcon name="loader" />
    </div>
    <ObsidianSetting v-else name="Done!">
      <ObsidianButton cta @click="$emit('next')">Next</ObsidianButton>
    </ObsidianSetting>
  </div>
</template>

<style scoped>
.loader-continer {
  display: flex;
  justify-content: center;
  padding: var(--size-4-2);
}
</style>
