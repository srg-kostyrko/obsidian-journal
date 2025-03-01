<script setup lang="ts">
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";
import ObsidianIcon from "@/components/obsidian/ObsidianIcon.vue";
import ObsidianTextInput from "@/components/obsidian/ObsidianTextInput.vue";
import type { CalendarConfig } from "@/types/old-settings.types";
import { nextTick, onMounted, ref } from "vue";
import { countSections, migrateCalendarJournal } from "./v1-v2";
import { usePlugin } from "@/composables/use-plugin";

const { journal, keepFrontmatter } = defineProps<{
  journal: CalendarConfig;
  keepFrontmatter: boolean;
}>();
const emit = defineEmits<{ next: []; finished: [] }>();

const plugin = usePlugin();

const stage = ref("names");
const sectionCount = countSections(journal);

const shelfName = ref("");
const dayName = ref("");
const monthName = ref("");
const weekName = ref("");
const quarterName = ref("");
const yearName = ref("");

async function startProcessing() {
  stage.value = "processing";
  if (plugin.usesShelves && shelfName.value && !plugin.hasShelf(shelfName.value)) {
    plugin.createShelf(shelfName.value);
  }
  await migrateCalendarJournal(
    plugin,
    journal,
    {
      shelf: shelfName.value,
      day: dayName.value,
      week: weekName.value,
      month: monthName.value,
      quarter: quarterName.value,
      year: yearName.value,
    },
    keepFrontmatter,
  );
  plugin.reprocessNotes();
  emit("finished");
  stage.value = "done";
}

onMounted(async () => {
  if (sectionCount === 0) {
    emit("finished");
    void nextTick(() => {
      emit("next");
    });
    return;
  }
  if (sectionCount === 1) {
    dayName.value = journal.name;
    weekName.value = journal.name;
    monthName.value = journal.name;
    quarterName.value = journal.name;
    yearName.value = journal.name;
    await startProcessing();
  } else {
    stage.value = "names";
    shelfName.value = journal.name;
    dayName.value = `${journal.name} daily`;
    weekName.value = `${journal.name} weekly`;
    monthName.value = `${journal.name} monthly`;
    quarterName.value = `${journal.name} quarterly`;
    yearName.value = `${journal.name} yearly`;
  }
});
</script>

<template>
  <div>
    <ObsidianSetting heading>
      <template #name>Migrating {{ journal.name }}</template>
    </ObsidianSetting>
    <template v-if="stage === 'names'">
      <ObsidianSetting v-if="plugin.usesShelves" name="Shelf name">
        <ObsidianTextInput v-model="shelfName" />
      </ObsidianSetting>
      <ObsidianSetting v-if="journal.day.enabled" name="Daily journal name">
        <ObsidianTextInput v-model="dayName" />
      </ObsidianSetting>
      <ObsidianSetting v-if="journal.week.enabled" name="Weekly journal name">
        <ObsidianTextInput v-model="weekName" />
      </ObsidianSetting>
      <ObsidianSetting v-if="journal.month.enabled" name="Monthly journal name">
        <ObsidianTextInput v-model="monthName" />
      </ObsidianSetting>
      <ObsidianSetting v-if="journal.quarter.enabled" name="Quarterly journal name">
        <ObsidianTextInput v-model="quarterName" />
      </ObsidianSetting>
      <ObsidianSetting v-if="journal.year.enabled" name="Yearly journal name">
        <ObsidianTextInput v-model="yearName" />
      </ObsidianSetting>
      <ObsidianSetting>
        <ObsidianButton cta @click="startProcessing">Migrate</ObsidianButton>
      </ObsidianSetting>
    </template>
    <div v-else-if="stage === 'processing'" class="loader-continer">
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
