<script setup lang="ts">
import { computed } from "vue";
import { journals$, journalsList$ } from "@/stores/settings.store";
import NavigationBlockRow from "./NavigationBlockRow.vue";
import { plugin$ } from "@/stores/obsidian.store";
import { openDate, openDateInJournal } from "@/journals/open-date";

const props = defineProps<{
  refDate: string;
  journalName: string;
}>();

defineEmits<(e: "move-up" | "move-down" | "edit" | "remove", index: number) => void>();

const journalSettings = computed(() => journals$.value[props.journalName]);
const journal = computed(() => plugin$.value.getJournal(props.journalName));

async function navigate(type: string, date: string, journalName?: string) {
  if (type === "self") {
    const metadata = await journal.value?.find(props.refDate);
    if (metadata) journal.value?.open(metadata);
  } else if (type === "journal") {
    if (!journalName) return;
    await openDateInJournal(date, journalName);
  } else {
    const journals = journalsList$.value.filter((j) => j.write.type === type).map((j) => j.name);
    await openDate(date, journals);
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
