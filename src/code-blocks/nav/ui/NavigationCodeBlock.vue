<script setup lang="ts">
import { computed } from "vue";

import type { AnchorString, Period } from "@/calendar";
import { useCellDecorations } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, type CodeBlockProps } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository, OpenDateFlow } from "@/journals";
import type { JournalConfig } from "@/journals";
import { ShelvesRepository } from "@/shelves";
import UiIconButton from "@/ui/UiIconButton.vue";

import { periodForJournal } from "../period-for-journal";

import NavBlock from "./NavBlock.vue";

const { path } = defineProps<CodeBlockProps<Record<string, never>>>();

const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);
const cycle = useService(CycleService);
const shelves = useService(ShelvesRepository);
const flows = useService(Flows);

const entryOpt = computed(() => index.entryByPath(path));
const journalOpt = computed(() => (entryOpt.value.isSome() ? journals.get(entryOpt.value.value.journalName) : null));
const isConnected = computed(() => entryOpt.value.isSome() && journalOpt.value?.isSome() === true);

const journal = computed<JournalConfig | null>(() =>
  isConnected.value && journalOpt.value !== null ? journalOpt.value.getOr(null as unknown as JournalConfig) : null,
);
const currentAnchor = computed<AnchorString | null>(() =>
  entryOpt.value.isSome() ? entryOpt.value.value.anchor : null,
);

const adjacent = computed<{ previous: AnchorString | null; next: AnchorString | null }>(() => {
  const currentJournal = journal.value;
  const anchor = currentAnchor.value;
  if (!currentJournal || !anchor) return { previous: null, next: null };
  if (currentJournal.navBlock.type === "existing") {
    const previousPath = index.findPrevious(currentJournal.name, anchor);
    const nextPath = index.findNext(currentJournal.name, anchor);
    const previous = previousPath.flatMap((p) => index.entryByPath(p)).map((entry) => entry.anchor);
    const next = nextPath.flatMap((p) => index.entryByPath(p)).map((entry) => entry.anchor);
    return {
      previous: previous.getOr(null as unknown as AnchorString),
      next: next.getOr(null as unknown as AnchorString),
    };
  }
  return {
    previous: cycle.previousAnchor(currentJournal.name, anchor).getOr(null as unknown as AnchorString),
    next: cycle.nextAnchor(currentJournal.name, anchor).getOr(null as unknown as AnchorString),
  };
});

const periods = computed<Period[]>(() => {
  const currentJournal = journal.value;
  if (!currentJournal) return [];
  const list: Period[] = [];
  const anchor = currentAnchor.value;
  if (anchor) list.push(periodForJournal(currentJournal.write, anchor));
  if (adjacent.value.previous) list.push(periodForJournal(currentJournal.write, adjacent.value.previous));
  if (adjacent.value.next) list.push(periodForJournal(currentJournal.write, adjacent.value.next));
  return list;
});

const shelfJournalNames = computed<readonly string[]>(() => {
  const currentJournal = journal.value;
  if (!currentJournal) return [];
  const owning = [...shelves.find().list()].find((shelf) => shelf.journals.includes(currentJournal.name));
  if (!owning) return [];
  return [...journals.find().list()]
    .filter((other) => owning.journals.includes(other.name) && other.write.type === currentJournal.write.type)
    .map((other) => other.name);
});

useCellDecorations(
  () => periods.value,
  () => shelfJournalNames.value,
);

function openAdjacent(anchor: AnchorString | null, event: MouseEvent): void {
  const currentJournal = journal.value;
  if (!currentJournal || !anchor) return;
  void flows.invoke(OpenDateFlow, {
    anchor,
    journalNames: [currentJournal.name],
    existingOnly: currentJournal.navBlock.type === "existing",
    openMode: defineOpenMode(event),
  });
}
</script>

<template>
  <div v-if="!isConnected" class="journal-nav-not-connected">{{ m.code_blocks_nav_not_connected() }}</div>
  <div v-else-if="journal && currentAnchor" class="nav-view">
    <div v-if="adjacent.previous" class="nav-block-relative">
      <NavBlock :journal :ref-date="adjacent.previous" :period="periodForJournal(journal.write, adjacent.previous)" />
      <UiIconButton
        icon="arrow-left"
        class="nav-prev"
        :tooltip="m.code_blocks_nav_previous()"
        @click="(event: MouseEvent) => openAdjacent(adjacent.previous, event)"
        @auxclick.middle.prevent="(event: MouseEvent) => openAdjacent(adjacent.previous, event)"
      />
    </div>
    <div v-else class="nav-block-placeholder" />

    <NavBlock :journal :ref-date="currentAnchor" :period="periodForJournal(journal.write, currentAnchor)" />

    <div v-if="adjacent.next" class="nav-block-relative">
      <UiIconButton
        icon="arrow-right"
        class="nav-next"
        :tooltip="m.code_blocks_nav_next()"
        @click="(event: MouseEvent) => openAdjacent(adjacent.next, event)"
        @auxclick.middle.prevent="(event: MouseEvent) => openAdjacent(adjacent.next, event)"
      />
      <NavBlock :journal :ref-date="adjacent.next" :period="periodForJournal(journal.write, adjacent.next)" />
    </div>
    <div v-else class="nav-block-placeholder" />
  </div>
</template>

<style scoped>
.nav-view {
  display: flex;
  justify-content: space-around;
  gap: 50px;
  --icon-size: 3em;
}
.nav-block-placeholder {
  flex-basis: 20%;
}
</style>
