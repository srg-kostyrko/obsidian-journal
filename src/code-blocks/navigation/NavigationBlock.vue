<script setup lang="ts">
import { computed } from "vue";
import NavigationBlockRow from "./NavigationBlockRow.vue";
import { openDate, openDateInJournal } from "@/journals/open-date";
import { useShelfProvider } from "@/composables/use-shelf";
import type { NavBlockRow } from "@/types/settings.types";
import { useApp } from "@/composables/use-app";
import { usePlugin } from "@/composables/use-plugin";

const props = defineProps<{
  refDate: string;
  journalName: string;
}>();

defineEmits<(event: "move-up" | "move-down" | "edit" | "remove", index: number) => void>();

const app = useApp();
const plugin = usePlugin();

const journal = computed(() => plugin.getJournal(props.journalName));
const shelfName = computed(() => journal.value?.shelfName ?? null);

const { journals } = useShelfProvider(shelfName);

async function navigate(type: NavBlockRow["link"], date: string, journalName?: string) {
  if (type === "none") return;
  if (type === "self") {
    const metadata = journal.value?.get(props.refDate);
    if (metadata) await journal.value?.open(metadata);
  } else if (type === "journal") {
    if (!journalName) return;
    await openDateInJournal(plugin, date, journalName);
  } else {
    const journalsToUse = journals[type].value.map((journal) => journal.name);
    await openDate(app, plugin, date, journalsToUse);
  }
}
</script>

<template>
  <div v-if="journal" class="nav-block">
    <div v-for="(row, index) of journal.navBlock.rows" :key="index">
      <NavigationBlockRow
        :journal="journal"
        :row="row"
        :ref-date="refDate"
        :default-format="journal.dateFormat"
        @navigate="navigate"
      />
    </div>
  </div>
</template>

<style scoped>
.nav-block {
  display: flex;
  flex-direction: column;
  text-align: center;
}
</style>
