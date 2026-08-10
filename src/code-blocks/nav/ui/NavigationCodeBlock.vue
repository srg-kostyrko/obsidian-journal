<script setup lang="ts">
import { computed } from "vue";

import type { AnchorString, Period } from "@/calendar";
import { hasOffsetCondition, useCellDecorations } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, type CodeBlockProps } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  OpenDateFlow,
  TimelineService,
  useIndexVersion,
} from "@/journals";
import { ShelvesRepository, type ShelfConfig } from "@/shelves";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";

import { navBlockDecorationScope, navRowDecorationScope } from "../decoration-scopes";
import { periodForJournal } from "../period-for-journal";

import NavBlock from "./NavBlock.vue";

const { path } = defineProps<CodeBlockProps<Record<string, never>>>();

const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);
const cycle = useService(CycleService);
const timeline = useService(TimelineService);
const shelves = useService(ShelvesRepository);
const flows = useService(Flows);

const indexVersion = useIndexVersion();

const entryOpt = computed(() => {
  void indexVersion.value;
  return index.entryByPath(path);
});
const journalOpt = computed(() =>
  entryOpt.value.isSome() ? journals.get(entryOpt.value.value.journalName) : undefined,
);
const isConnected = computed(() => entryOpt.value.isSome() && journalOpt.value?.isSome() === true);

const journal = computed(() =>
  isConnected.value && journalOpt.value !== undefined ? journalOpt.value.getOrUndefined() : undefined,
);
const currentAnchor = computed(() => (entryOpt.value.isSome() ? entryOpt.value.value.anchor : undefined));

const adjacent = computed<{ previous: AnchorString | undefined; next: AnchorString | undefined }>(() => {
  const currentJournal = journal.value;
  const anchor = currentAnchor.value;
  if (!currentJournal || !anchor) return { previous: undefined, next: undefined };
  // An adjacent period outside the journal's timeline has no note to reach — OpenDateFlow would
  // silently reject it — so collapse it to the empty placeholder rather than a dead control.
  const inBounds = (candidate: AnchorString | undefined): AnchorString | undefined =>
    candidate !== undefined && timeline.contains(currentJournal.name, candidate) ? candidate : undefined;
  if (currentJournal.navBlock.type === "existing") {
    void indexVersion.value;
    const previousPath = index.findPrevious(currentJournal.name, anchor);
    const nextPath = index.findNext(currentJournal.name, anchor);
    const previous = previousPath.flatMap((p) => index.entryByPath(p)).map((entry) => entry.anchor);
    const next = nextPath.flatMap((p) => index.entryByPath(p)).map((entry) => entry.anchor);
    return {
      previous: inBounds(previous.getOrUndefined()),
      next: inBounds(next.getOrUndefined()),
    };
  }
  return {
    previous: inBounds(cycle.previousAnchor(currentJournal.name, anchor).getOrUndefined()),
    next: inBounds(cycle.nextAnchor(currentJournal.name, anchor).getOrUndefined()),
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

// v2's whole-block decoration (NavigationBlock) draws on the current journal's own decorations
// only: `decorations[type].filter(d => d.journalName === journalName)`.
const blockJournalNames = computed<readonly string[]>(() => (journal.value ? [journal.value.name] : []));

// Shared by rowJournalNames and decorationShelf below, which both need "the shelf that owns
// the current journal" and only differ in what they project out of it once found.
const owningShelf = computed<Option<ShelfConfig>>(() => {
  const currentJournal = journal.value;
  if (!currentJournal) return Option.none();
  return shelves
    .find()
    .filter((shelf) => shelf.journals.includes(currentJournal.name))
    .first();
});

// v2's per-row decoration (NavigationBlockRow) draws on every same-write-type journal in scope:
// `decorations[type]`, which useShelfProvider builds from the owning shelf's journals, or from
// all journals when the journal belongs to no shelf.
const rowJournalNames = computed<readonly string[]>(() => {
  const currentJournal = journal.value;
  if (!currentJournal) return [];
  const owningJournalNames = owningShelf.value.match<readonly string[] | null>({
    some: (shelf) => shelf.journals,
    none: () => null,
  });
  const inScope = owningJournalNames
    ? [...journals.find().list()].filter((other) => owningJournalNames.includes(other.name))
    : [...journals.find().list()];
  return inScope.filter((other) => other.write.type === currentJournal.write.type).map((other) => other.name);
});

// Journal-free decorations belong to the per-row scope: every row is a different date, while
// the whole-block scope decorates the block from the current journal's own rules. Only fixed
// (day-kind) journals are affected — a weekly journal's nav block renders week rows and shows
// none of these, and a custom journal's rows are excluded below despite also being day-kind.
const decorationShelf = computed<string | null>(() =>
  owningShelf.value.match<string | null>({ some: (shelf) => shelf.name, none: () => null }),
);

useCellDecorations({
  periods: () => periods.value,
  journalNames: () => blockJournalNames.value,
  scope: navBlockDecorationScope,
});
// A custom journal's rows are "day"-kind periods at their interval's start anchor, colliding
// with the day cell beneath them (CustomIntervalsBlock.vue:76-85 draws the same distinction).
// Calendar (vault-wide/shelf) rules paint days, not intervals, so they're left out entirely;
// the journal's own offset-carrying rules mark a single day inside the interval and belong to
// the day grid instead — only its non-offset rules describe the interval itself.
useCellDecorations({
  periods: () => periods.value,
  journalNames: () => rowJournalNames.value,
  scope: navRowDecorationScope,
  ...(journal.value?.write.type === "custom"
    ? { filter: (binding) => !hasOffsetCondition(binding.decoration) }
    : { calendarDecorations: { shelf: () => decorationShelf.value } }),
});

function openAdjacent(anchor: AnchorString | undefined, event: MouseEvent): void {
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
      <NavBlock
        class="nav-block-previous"
        :block="journal.navBlock"
        :journal
        :ref-date="adjacent.previous"
        :period="periodForJournal(journal.write, adjacent.previous)"
        :block-scope="navBlockDecorationScope"
        :row-scope="navRowDecorationScope"
        :shelf="decorationShelf"
      />
      <UiIconButton
        :icon="icons.nav.prev"
        class="nav-prev"
        :tooltip="m.code_blocks_nav_previous()"
        @click="(event: MouseEvent) => openAdjacent(adjacent.previous, event)"
        @auxclick.middle.prevent="(event: MouseEvent) => openAdjacent(adjacent.previous, event)"
      />
    </div>
    <div v-else class="nav-block-placeholder" />

    <NavBlock
      class="nav-block-current"
      :block="journal.navBlock"
      :journal
      :ref-date="currentAnchor"
      :period="periodForJournal(journal.write, currentAnchor)"
      :block-scope="navBlockDecorationScope"
      :row-scope="navRowDecorationScope"
      :shelf="decorationShelf"
    />

    <div v-if="adjacent.next" class="nav-block-relative">
      <UiIconButton
        :icon="icons.nav.next"
        class="nav-next"
        :tooltip="m.code_blocks_nav_next()"
        @click="(event: MouseEvent) => openAdjacent(adjacent.next, event)"
        @auxclick.middle.prevent="(event: MouseEvent) => openAdjacent(adjacent.next, event)"
      />
      <NavBlock
        class="nav-block-next"
        :block="journal.navBlock"
        :journal
        :ref-date="adjacent.next"
        :period="periodForJournal(journal.write, adjacent.next)"
        :block-scope="navBlockDecorationScope"
        :row-scope="navRowDecorationScope"
        :shelf="decorationShelf"
      />
    </div>
    <div v-else class="nav-block-placeholder" />
  </div>
</template>

<style scoped>
.nav-view {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 16px;
  --icon-size: 3em;
}
/* Three equal columns that share the row and shrink to fit, so wide content
   (e.g. custom-interval titles) wraps inside its block instead of pushing the
   third block onto a second row. The min-width is the readability floor: once a
   column can no longer stay that wide, flex-wrap stacks the blocks — preserving
   the narrow-pane stacking from #216. */
.nav-block-relative,
.nav-block-current {
  flex: 1 1 0;
  min-width: 130px;
}
.nav-block-placeholder {
  flex: 1 1 0;
  min-width: 0;
}
/* Keep each chevron inline and vertically centered between its block and the
   current block, rather than absolutely offset (which overflowed the pane). */
.nav-block-relative {
  display: flex;
  align-items: center;
  gap: 4px;
}
.nav-block-relative > .nav-block {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
