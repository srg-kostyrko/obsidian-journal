<script setup lang="ts">
import { computed } from "vue";

import type { AnchorString } from "@/calendar";
import { navSegmentFixedScope, navSegmentIntervalScope } from "@/code-blocks/nav/decoration-scopes";
import { resolveSegmentDecoration, type SegmentDecorationCell } from "@/code-blocks/nav/segment-decoration";
import { hasOffsetCondition, useCellDecorations } from "@/decorations";
import { useService } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsRepository, TimelineService, useIndexVersion } from "@/journals";
import type { JournalConfig } from "@/journals";
import { useCalendarAppearanceStyle } from "@/notes-calendar/appearance/use-appearance-style";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import { ShelvesRepository } from "@/shelves";

import { useViewContext } from "../../../view-context";
import { resolveWindow } from "../window-resolution";

import CustomIntervalsSection from "./CustomIntervalsSection.vue";

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
const scope = useShelfScope(() => context.shelf.value);

const displayedJournals = computed(() => {
  const filter = props.config.journals;
  return scope.custom.value.filter((name) => !filter || filter.includes(name));
});

const window = computed(() => resolveWindow(props.config.window, context.refDate.value));

const indexVersion = useIndexVersion();

interface Section {
  readonly journalName: string;
  readonly journal: JournalConfig;
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
    out.push({ journalName: name, journal: cfg, entries });
  }
  return out;
});

// intervalBlock segments are edited through the same segment editor as navBlock's, so one can
// carry any link kind — a non-self link resolves to a fixed-period target, or to another custom
// journal's own interval anchor, neither of which a section's own periods cover. Without this,
// that segment injects null and paints nothing, silently. See segment-decoration.ts: entry
// is irrelevant to the resolved cell, so Option.none() is safe here even though there's no single
// "note behind this row".
const segmentCells = computed<readonly SegmentDecorationCell[]>(() => {
  const all = [...journalsRepo.find().list()];
  const shelfList = [...shelvesRepo.find().list()];
  const out: SegmentDecorationCell[] = [];
  for (const section of sections.value) {
    for (const entry of section.entries) {
      for (const line of section.journal.intervalBlock.lines) {
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

// Per-segment only — the whole-block draw reads a per-section map instead (see
// CustomIntervalsSection.vue). A segment's target is its own, so this map spans every journal
// any segment resolves to; a segment can link to another custom journal or a shifted self whose
// anchor falls outside the rendered window, which the raw section periods would not cover.
useCellDecorations({
  periods: () => intervalCells.value.map((cell) => cell.period),
  journalNames: () => [...new Set(intervalCells.value.flatMap((cell) => cell.journalNames))],
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
    <CustomIntervalsSection
      v-for="section of sections"
      :key="section.journalName"
      :journal="section.journal"
      :entries="section.entries"
      :shelf="context.shelf.value"
    />
  </div>
</template>

<style scoped>
.journal-view-custom-intervals {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
</style>
