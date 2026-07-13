<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, Clock, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, type CodeBlockProps } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository, NotePathService, OpenDateFlow } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import { buildHomeItems, type HomeItem } from "../home-items";

import type { HomeBlockConfig } from "../home-config";

const { path, config } = defineProps<CodeBlockProps<HomeBlockConfig>>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const shelves = useService(ShelvesRepository);
const notePaths = useService(NotePathService);
const flows = useService(Flows);

const today = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);

const currentJournalName = computed(() =>
  index
    .entryByPath(path)
    .map((entry) => entry.journalName)
    .getOr(null as unknown as string),
);

const shelfByJournal = computed(() => {
  const map = new Map<string, string>();
  for (const shelf of shelves.find().list()) {
    for (const journalName of shelf.journals) map.set(journalName, shelf.name);
  }
  return map;
});

const effectiveShelf = computed(() => {
  if (config.shelf !== undefined) return config.shelf;
  const current = currentJournalName.value;
  if (current === null) return null;
  return shelfByJournal.value.get(current) ?? null;
});

const allJournals = computed(() => [...journals.find().list()]);

const items = computed<readonly HomeItem[]>(() =>
  buildHomeItems(config, allJournals.value, today.value, effectiveShelf.value, shelfByJournal.value, {
    pathForCustom: (journal) => {
      const result = notePaths.pathForDate(journal.name, CalendarDate.fromAnchor(today.value));
      if (result.kind === "err") return null;
      const fullPath = result.value;
      const slash = fullPath.lastIndexOf("/");
      const basename = slash === -1 ? fullPath : fullPath.slice(slash + 1);
      return basename.endsWith(".md") ? basename.slice(0, -3) : basename;
    },
  }),
);

function open(item: HomeItem, event: MouseEvent): void {
  void flows.invoke(OpenDateFlow, {
    anchor: today.value,
    journalNames: [...item.journalNames],
    openMode: defineOpenMode(event),
  });
}
</script>

<template>
  <div class="home-code-block">
    <span v-if="items.length === 0" class="home-code-block__empty">{{ m.code_blocks_home_empty() }}</span>
    <template v-for="(item, position) of items" :key="`${item.entry}-${item.journalNames.join('|')}`">
      <span v-if="position > 0" class="home-code-block__separator">{{ config.separator }}</span>
      <a href="#" @click.stop.prevent="open(item, $event)" @auxclick.middle.stop.prevent="open(item, $event)">{{
        item.label
      }}</a>
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
  font-size: calc(var(--font-text-size) * v-bind("config.scale"));
}
.home-code-block__empty {
  color: var(--text-faint);
  font-size: var(--font-text-size);
}
</style>
