<script setup lang="ts">
import { computed } from "vue";

import type { AnchorString } from "@/calendar";
import { navSegmentFixedScope, navSegmentIntervalScope } from "@/code-blocks/nav/decoration-scopes";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import { resolveSegmentDecoration, type SegmentDecorationCell } from "@/code-blocks/nav/segment-decoration";
import NavBlock from "@/code-blocks/nav/ui/NavBlock.vue";
import { hasOffsetCondition, useCellDecorations } from "@/decorations";
import { useService } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsRepository, TimelineService, useIndexVersion } from "@/journals";
import type { JournalConfig, JournalNavBlock } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { useCalendarAppearanceStyle } from "@/notes-calendar/appearance/use-appearance-style";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import { ShelvesRepository } from "@/shelves";

import { useViewContext } from "../../../view-context";
import { resolveWindow } from "../window-resolution";

import type { BlockInstanceId } from "../../../config";
import type { CustomIntervalsConfig } from "../custom-intervals-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: CustomIntervalsConfig;
}>();

const context = useViewContext();
const appearanceStyle = useCalendarAppearanceStyle();
const journalsRepo = useService(JournalsRepository);
const shelvesRepo = useService(ShelvesRepository);
const cycle = useService(CycleService);
const timeline = useService(TimelineService);
const activeEntry = useService(ActiveEntryViewModel);
const scope = useShelfScope(() => context.shelf.value);

function isEntryActive(journalName: string, anchor: AnchorString): boolean {
  const current = activeEntry.active.value;
  return current !== null && current.journalName === journalName && current.anchor === anchor;
}

const displayedJournals = computed(() => {
  const filter = props.config.journals;
  return scope.custom.value.filter((name) => !filter || filter.includes(name));
});

const window = computed(() => resolveWindow(props.config.window, context.refDate.value));

const indexVersion = useIndexVersion();

interface Section {
  readonly journalName: string;
  readonly journal: JournalConfig;
  readonly block: JournalNavBlock;
  readonly entries: readonly { anchor: AnchorString }[];
}

const sections = computed<readonly Section[]>(() => {
  // JournalsIndex is event-based, not Vue-reactive; re-run when it signals an entry change.
  void indexVersion.value;
  const candidates = displayedJournals.value;
  const out: Section[] = [];
  for (const name of candidates) {
    const cfg = journalsRepo.get(name).getOrUndefined();
    if (!cfg) continue;
    const entries = cycle
      .intervalsInRange(name, window.value.start, window.value.end)
      .filter((anchor) => timeline.contains(name, anchor))
      .map((anchor) => ({ anchor }));
    // A section renders no journal name of its own, so an entry-less one would show as a bare
    // divider; skip it rather than rendering empty chrome.
    if (entries.length === 0) continue;
    out.push({ journalName: name, journal: cfg, block: cfg.intervalBlock, entries });
  }
  return out;
});

// intervalBlock segments are edited through the same segment editor as navBlock's, so one can
// carry any link kind — a non-self link resolves to a fixed-period target, or to another custom
// journal's own interval anchor, neither of which the raw section periods below cover. Without
// this, that segment injects null and paints nothing, silently. See segment-decoration.ts: entry
// is irrelevant to the resolved cell, so Option.none() is safe here even though there's no single
// "note behind this row".
const segmentCells = computed<readonly SegmentDecorationCell[]>(() => {
  const all = [...journalsRepo.find().list()];
  const shelfList = [...shelvesRepo.find().list()];
  const out: SegmentDecorationCell[] = [];
  for (const section of sections.value) {
    for (const entry of section.entries) {
      for (const line of section.block.lines) {
        for (const segment of line) {
          if (!segment.addDecorations) continue;
          const cell = resolveSegmentDecoration(
            segment,
            section.journal,
            all,
            shelfList,
            Option.none(),
            entry.anchor,
            cycle,
          );
          if (cell) out.push(cell);
        }
      }
    }
  }
  return out;
});

const fixedCells = computed(() => segmentCells.value.filter((cell) => cell.scopeKind === "fixed"));
const intervalCells = computed(() => segmentCells.value.filter((cell) => cell.scopeKind === "interval"));

// Each interval is a "day"-kind period at its start anchor, so the engine and CellDecoration
// agree on the cell key; scoping to the rendered custom journals keeps fixed-period decorations
// (which live on the calendar grid) out of the interval list. Union in the segment-derived
// interval cells too: a segment can link to another custom journal or a shifted self that
// resolves to an anchor outside the rendered window, which the raw section periods don't cover.
useCellDecorations({
  periods: () => [
    ...sections.value.flatMap((section) =>
      section.entries.map((entry) => periodForJournal(section.journal.write, entry.anchor)),
    ),
    ...intervalCells.value.map((cell) => cell.period),
  ],
  journalNames: () => [
    ...new Set([
      ...sections.value.map((section) => section.journalName),
      ...intervalCells.value.flatMap((cell) => cell.journalNames),
    ]),
  ],
  scope: navSegmentIntervalScope,
  // Offset decorations mark single days inside an interval; they render on the day
  // calendar grid, never on the whole-interval row.
  filter: (binding) => !hasOffsetCondition(binding.decoration),
});

useCellDecorations({
  periods: () => fixedCells.value.map((cell) => cell.period),
  journalNames: () => [...new Set(fixedCells.value.flatMap((cell) => cell.journalNames))],
  scope: navSegmentFixedScope,
  calendarDecorations: { shelf: () => context.shelf.value },
});
</script>

<template>
  <div class="journal-view-custom-intervals" :style="appearanceStyle">
    <section
      v-for="section of sections"
      :key="section.journalName"
      class="journal-view-custom-intervals__section"
      :data-journal="section.journalName"
    >
      <div
        v-for="entry of section.entries"
        :key="entry.anchor"
        class="journal-view-custom-intervals__entry"
        :data-anchor="entry.anchor"
        :data-active="isEntryActive(section.journalName, entry.anchor) || null"
      >
        <NavBlock
          :block="section.block"
          :journal="section.journal"
          :ref-date="entry.anchor"
          :period="periodForJournal(section.journal.write, entry.anchor)"
          :block-scope="navSegmentIntervalScope"
          :shelf="context.shelf.value"
        />
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
.journal-view-custom-intervals__entry[data-active] {
  color: var(--journal-cell-active-color);
  background-color: var(--journal-cell-active-bg);
}
/* The nav rows set their own per-row color, so the active highlight forces its color on
   the nested content to win. */
.journal-view-custom-intervals__entry[data-active] :deep(*) {
  color: var(--journal-cell-active-color) !important;
}
</style>
