<script setup lang="ts">
import { computed } from "vue";

import type { AnchorString } from "@/calendar";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import NavBlockRow from "@/code-blocks/nav/ui/NavBlockRow.vue";
import { CellDecoration } from "@/decorations";
import { useService } from "@/infrastructure/di";
import { JournalsIndex, JournalsRepository } from "@/journals";
import type { JournalConfig, JournalNavBlock } from "@/journals";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";

import { useViewContext } from "../../../view-context";
import { resolveWindow } from "../window-resolution";

import type { BlockInstanceId } from "../../../config";
import type { CustomIntervalsConfig } from "../custom-intervals-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: CustomIntervalsConfig;
}>();

const context = useViewContext();
const index = useService(JournalsIndex);
const journalsRepo = useService(JournalsRepository);
const scope = useShelfScope(() => context.shelf.value);

const window = computed(() => resolveWindow(props.config.window, context.refDate.value));

interface Section {
  readonly journalName: string;
  readonly journal: JournalConfig;
  readonly block: JournalNavBlock;
  readonly entries: readonly { anchor: AnchorString }[];
}

const sections = computed<readonly Section[]>(() => {
  const filter = props.config.journals;
  const candidates = scope.custom.value.filter((name) => !filter || filter.includes(name));
  const out: Section[] = [];
  for (const name of candidates) {
    const cfg = journalsRepo.get(name).getOr(undefined as never) as JournalConfig | undefined;
    if (!cfg) continue;
    const range = index.getRange(name, window.value.start, window.value.end);
    const entries = [...range.keys()].map((anchor) => ({ anchor: anchor }));
    if (entries.length === 0 && props.config.hideEmpty) continue;
    out.push({ journalName: name, journal: cfg, block: cfg.intervalBlock, entries });
  }
  return out;
});
</script>

<template>
  <div class="journal-view-custom-intervals">
    <section
      v-for="section of sections"
      :key="section.journalName"
      class="journal-view-custom-intervals__section"
      :data-journal="section.journalName"
    >
      <div v-for="entry of section.entries" :key="entry.anchor" class="journal-view-custom-intervals__entry">
        <CellDecoration
          v-if="section.block.decorateWholeBlock"
          :period="periodForJournal(section.journal.write, entry.anchor)"
        >
          <NavBlockRow
            v-for="(row, rowIndex) of section.block.rows"
            :key="rowIndex"
            :journal="section.journal"
            :row="row"
            :ref-date="entry.anchor"
            :period="periodForJournal(section.journal.write, entry.anchor)"
          />
        </CellDecoration>
        <template v-else>
          <NavBlockRow
            v-for="(row, rowIndex) of section.block.rows"
            :key="rowIndex"
            :journal="section.journal"
            :row="row"
            :ref-date="entry.anchor"
            :period="periodForJournal(section.journal.write, entry.anchor)"
          />
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.journal-view-custom-intervals {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-view-custom-intervals__section {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
  border-bottom: 1px solid var(--color-accent);
  padding-bottom: var(--size-2-2);
}
.journal-view-custom-intervals__section:last-child {
  border-bottom: 0;
}
</style>
