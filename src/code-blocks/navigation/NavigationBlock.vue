<script setup lang="ts">
import { computed } from "vue";
import { journals$ } from "@/stores/settings.store";
import NavigationBlockRow from "./NavigationBlockRow.vue";
import { plugin$ } from "@/stores/obsidian.store";
import { openDate, openDateInJournal } from "@/journals/open-date";
import { useShelfProvider } from "@/composables/use-shelf";
import { NavBlockRow } from "@/types/settings.types";

const props = defineProps<{
  refDate: string;
  journalName: string;
}>();

defineEmits<(event: "move-up" | "move-down" | "edit" | "remove", index: number) => void>();

const journalSettings = computed(() => journals$.value[props.journalName]);
const journal = computed(() => plugin$.value.getJournal(props.journalName));
const shelfName = computed(() => journalSettings.value?.shelves[0] ?? null);

const { journals } = useShelfProvider(shelfName);

async function navigate(type: NavBlockRow["link"], date: string, journalName?: string) {
  if (type === "none") return;
  if (type === "self") {
    const metadata = journal.value?.get(props.refDate);
    if (metadata) await journal.value?.open(metadata);
  } else if (type === "journal") {
    if (!journalName) return;
    await openDateInJournal(date, journalName);
  } else {
    const journalsToUse = journals[type].value.map((journal) => journal.name);
    await openDate(date, journalsToUse);
  }
}
</script>

<template>
  <div v-if="journal" class="nav-block">
    <div v-for="(row, index) of journalSettings.navBlock.rows" :key="index">
      <NavigationBlockRow
        :journal="journal"
        :row="row"
        :ref-date="refDate"
        :default-format="journalSettings.dateFormat"
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
