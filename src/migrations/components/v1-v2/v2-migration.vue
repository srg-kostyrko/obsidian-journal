<script setup lang="ts">
import type { MigrationV1toV2 } from "@/types/migration.types";
import type { JournalConfigV1 } from "@/types/old-settings.types";
import { onMounted, ref } from "vue";

import ShelfDecision from "./ShelfDecision.vue";
import MigrateCalendar from "./MigrateCalendar.vue";
import MigrateInterval from "./MigrateInterval.vue";
import FrontMatterDecision from "./FrontMatterDecision.vue";
import { countSections } from "./v1-v2";

const { migration } = defineProps<{ migration: MigrationV1toV2 }>();
const emit = defineEmits<{
  finished: [];
}>();

let keepFrontOldMatter = ref(false);
let step = ref<"decideFrontmatter" | "decideShelf" | "journal">("decideFrontmatter");
let currentJournal = ref<JournalConfigV1 | null>();

onMounted(() => {
  if (migration.journals.length > 0) {
    step.value = "journal";
    currentJournal.value = migration.journals[0];
  } else {
    emit("finished");
  }
});

function next() {
  if (step.value === "decideShelf") {
    // eslint-disable-next-line vue/no-mutating-props
    migration.shelfDecided = true;
  }
  if (!migration.shelfDecided) {
    const hasShelfPotential = migration.journals.some((journal) => {
      if (journal.type === "calendar") {
        return countSections(journal) > 1;
      }
      return false;
    });
    if (hasShelfPotential) {
      step.value = "decideShelf";
      return;
    } else {
      // eslint-disable-next-line vue/no-mutating-props
      migration.shelfDecided = true;
    }
  }
  if (currentJournal.value) {
    currentJournal.value = null;
    const { journals } = migration;
    journals.shift();
  }
  if (migration.journals.length > 0) {
    step.value = "journal";
    currentJournal.value = migration.journals[0];
  } else {
    emit("finished");
  }
}
</script>

<template>
  <div>
    <FrontMatterDecision v-if="step === 'decideFrontmatter'" v-model="keepFrontOldMatter" @next="next" />
    <ShelfDecision v-if="step === 'decideShelf'" @next="next" />
    <div v-else-if="step === 'journal' && currentJournal">
      <MigrateCalendar
        v-if="currentJournal.type === 'calendar'"
        :journal="currentJournal"
        :keep-frontmatter="keepFrontOldMatter"
        @next="next"
      />
      <MigrateInterval
        v-else-if="currentJournal.type === 'interval'"
        :journal="currentJournal"
        :keep-frontmatter="keepFrontOldMatter"
        @next="next"
      />
    </div>
  </div>
</template>

<style scoped></style>
