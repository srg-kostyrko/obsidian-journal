<script setup lang="ts">
import { usePathData } from "@/composables/use-path-data";
import type { HomeCodeBlockConfig } from "./home-code-block.types";
import { computed } from "vue";
import { usePlugin } from "@/composables/use-plugin";
import { relativeDate, today } from "@/calendar";
import { openDate } from "@/journals/open-date";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import { defineOpenMode } from "@/utils/journals";

const { path, config } = defineProps<{ path: string; config: HomeCodeBlockConfig }>();
const scale = computed(() => config.scale ?? 1);
const noteData = usePathData(path);

const plugin = usePlugin();
const currentNoteJournal = computed(() => {
  if (!noteData.value) return null;
  return plugin.getJournal(noteData.value.journal);
});
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
const shelf = computed(() => config.shelf || currentNoteJournal.value?.shelfName);
const journals = computed(() => plugin.journals);

const listToShow = computed(() => {
  const list = [];
  const date = today().format(FRONTMATTER_DATE_FORMAT);
  for (const type of config.show) {
    const journalsByType = journals.value.filter((journal) => {
      return journal.type === type && (!shelf.value || journal.shelfName === shelf.value);
    });
    if (journalsByType.length === 0) continue;
    if (type === "custom") {
      for (const journal of journalsByType) {
        list.push({
          type,
          text: journal.getNoteNameForDate(date),
          journalNames: [journal.name],
        });
      }
    } else {
      list.push({
        type,
        text: relativeDate(type, today().format("YYYY-MM-DD")),
        journalNames: journalsByType.map((journal) => journal.name),
      });
    }
  }

  return list;
});

function open(type: HomeCodeBlockConfig["show"][number], journalNames: string[], event: MouseEvent) {
  const date = today().format("YYYY-MM-DD");
  if (type !== "custom" && type === currentNoteJournal.value?.type) {
    openDate(plugin, date, [currentNoteJournal.value.name], false, defineOpenMode(event), event).catch(console.error);
  } else {
    openDate(plugin, date, journalNames, false, defineOpenMode(event), event).catch(console.error);
  }
}
</script>

<template>
  <div class="home-code-block">
    <template v-for="(item, index) of listToShow" :key="item.text">
      <span v-if="index > 0">{{ config.separator }}</span>
      <a href="#" @click.stop.prevent="open(item.type, item.journalNames, $event)">{{ item.text }}</a>
    </template>
  </div>
</template>

<style scoped>
.home-code-block {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  text-align: center;
  gap: var(--size-2-2);
  font-size: calc(var(--font-text-size) * v-bind(scale));
}
</style>
