<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref, toRaw } from "vue";

import { Calendar, CalendarDate, periodOfKind, type AnchorString, type Period, type PeriodKind } from "@/calendar";
import { DatePicker, useAnchorField } from "@/calendar/ui";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { CycleService, TimelineService } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { useIndexVersion } from "@/journals/use-index-version";
import { ShelvesRepository } from "@/shelves/repository";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { attributeCell, type CellAttribution } from "../attribute-cell";
import { DecorationsStore } from "../decorations-store";
import {
  cellKey,
  DecorationEngine,
  hasOffsetCondition,
  periodKindForWrite,
  type Contribution,
  type DecorationSource,
} from "../engine";
import { gatherBindings } from "../gather-bindings";
import { describeCondition } from "../settings/ui/describe-condition";

import DecorationPreview from "./DecorationPreview.vue";

import type { JournalDecoration, JournalDecorationStyle } from "../config";
import type { DecorationOwner } from "../owner";
import type { Placement } from "../resolve-cell";

const props = defineProps<{ period?: Period; shelf?: string | null }>();

const journals = useService(JournalsRepository);
const shelves = useService(ShelvesRepository);
const store = useService(DecorationsStore);
const engine = useService(DecorationEngine);
const calendar = useService(Calendar);
const cycle = useService(CycleService);
const timeline = useService(TimelineService);
const indexVersion = useIndexVersion();

const initialPeriod = toRaw(props.period);
const anchor = ref<AnchorString>(
  initialPeriod ? toRaw(initialPeriod.anchor).toAnchor() : CalendarDate.today().toAnchor(),
);
const datePickerModel = useAnchorField({ anchor, picking: "day" });

// Same kind + anchor as the entry-point period identifies "the cell it came from" — a week's
// anchor can coincide with one of its days, so kind must be part of the identity too.
const entryKey = initialPeriod ? cellKey(initialPeriod.kind, initialPeriod.anchor.toAnchor()) : null;

const shelf = ref<string | null>(props.shelf ?? null);
const shelfModel = computed<string>({
  get: () => shelf.value ?? "",
  set: (value) => {
    shelf.value = value === "" ? null : value;
  },
});
const shelfNames = computed<readonly string[]>(() => [...shelves.find().map((entry) => entry.name)]);

const journalNames = computed<readonly string[]>(() => {
  if (shelf.value === null) return [...journals.find().map((entry) => entry.name)];
  return shelves.get(shelf.value).match<readonly string[]>({
    some: (config) => config.journals,
    none: () => [],
  });
});

const PERIOD_FORMAT: Record<PeriodKind, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  decade: "YYYY",
};

function formatPeriod(p: Period): string {
  return p.format(PERIOD_FORMAT[p.kind]);
}

type BreakdownCell =
  | {
      readonly kind: "fixed";
      readonly period: Period;
      readonly isEntry: boolean;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    }
  | {
      readonly kind: "interval";
      readonly period: Period;
      readonly journalName: string;
      // Journal names are unrestricted strings (spaces, punctuation, anything a user types), so
      // an id built from the name could break `aria-labelledby` (which tokenizes on whitespace)
      // or collide across names that differ only in the characters a slug would strip. The
      // journal's position in this render's journalNames list is unique and never needs escaping.
      readonly journalIndex: number;
      readonly isEntry: false;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    };

// An interval and the day cell it starts on share a period kind and anchor, so a key derived
// from the period alone would collide — the DOM id and the v-for key both need the section's
// kind (and, for an interval, its owning journal) to stay unique.
function cellId(cell: BreakdownCell): string {
  return match(cell)
    .with(
      { kind: "interval" },
      (c) => `decoration-breakdown-heading-interval-${c.journalIndex}-${c.period.anchor.toAnchor()}`,
    )
    .with({ kind: "fixed" }, (c) => `decoration-breakdown-heading-${c.period.kind}-${c.period.anchor.toAnchor()}`)
    .exhaustive();
}

// The heading must key off the section's kind, not its period kind: an interval is a "day"-kind
// period at its start anchor, so branching on period.kind would mislabel it as a day cell.
function headingOf(cell: BreakdownCell): string {
  return match(cell)
    .with({ kind: "interval" }, (c) =>
      m.decoration_breakdown_interval_heading({ journal: c.journalName, label: formatPeriod(c.period) }),
    )
    .with({ kind: "fixed" }, (c) =>
      m.decoration_breakdown_cell_heading({ kind: c.period.kind, label: formatPeriod(c.period) }),
    )
    .exhaustive();
}

const cells = computed<readonly BreakdownCell[]>(() => {
  void indexVersion.value;
  const selectedDate = CalendarDate.fromAnchor(anchor.value);

  const kinds = new Set<PeriodKind>(["day"]);
  for (const name of journalNames.value) {
    const opt = journals.get(name);
    if (opt.isSome()) kinds.add(periodKindForWrite(opt.value.write.type));
  }

  const periods = [...kinds].map((kind) => periodOfKind(kind, selectedDate));
  const bindings = gatherBindings(journals, store, {
    journalNames: journalNames.value,
    shelf: shelf.value,
    includeCalendar: true,
    // A custom journal's write kind is always "day", so without this every one of its
    // decorations would attribute to the day cell. Production splits them: the day grid takes
    // only offset-carrying ones (NotesMonthView.vue), the rest belong to the interval list.
    filter: (binding) => {
      const config = journals.get(binding.journalName).getOrUndefined();
      if (config?.write.type !== "custom") return true;
      return hasOffsetCondition(binding.decoration);
    },
  });
  const explained = engine.explainRange(periods, bindings);

  const out: BreakdownCell[] = [];
  for (const cellPeriod of periods) {
    const contributions = explained.get(cellKey(cellPeriod.kind, cellPeriod.anchor.toAnchor()));
    if (!contributions || contributions.length === 0) continue;
    out.push({
      kind: "fixed",
      period: cellPeriod,
      isEntry: entryKey !== null && cellKey(cellPeriod.kind, cellPeriod.anchor.toAnchor()) === entryKey,
      attribution: attributeCell(contributions),
      styles: contributions.map((contribution) => contribution.style),
    });
  }

  for (const [journalIndex, name] of journalNames.value.entries()) {
    const config = journals.get(name).getOrUndefined();
    if (config?.write.type !== "custom") continue;
    const intervalAnchor = cycle.anchorOf(name, selectedDate).getOrUndefined();
    if (intervalAnchor === undefined) continue;
    if (!timeline.contains(name, intervalAnchor)) continue;

    const intervalPeriod = periodForJournal(config.write, intervalAnchor);
    // An interval is a "day"-kind period at its start anchor, so its cell key collides with
    // the day cell's. A separate explainRange keeps the two from overwriting each other, and
    // the complementary filter is what makes them describe different things.
    const intervalBindings = gatherBindings(journals, store, {
      journalNames: [name],
      shelf: shelf.value,
      includeCalendar: false,
      filter: (binding) => !hasOffsetCondition(binding.decoration),
    });
    const intervalContributions = engine
      .explainRange([intervalPeriod], intervalBindings)
      .get(cellKey(intervalPeriod.kind, intervalPeriod.anchor.toAnchor()));
    if (!intervalContributions || intervalContributions.length === 0) continue;

    out.push({
      kind: "interval",
      period: intervalPeriod,
      journalName: name,
      journalIndex,
      isEntry: false,
      attribution: attributeCell(intervalContributions),
      styles: intervalContributions.map((contribution) => contribution.style),
    });
  }

  return out;
});

interface MarkGroup {
  readonly slot: Placement;
  readonly contributions: readonly Contribution[];
}

// Marks are additive across nine slots and never compete, so the modal shows every
// contributing mark side by side instead of the winner/overridden framing properties get —
// grouped by slot, since two marks in different corners are not the same fact.
function markGroupsOf(attribution: CellAttribution): readonly MarkGroup[] {
  const out: MarkGroup[] = [];
  for (const [slot, contributions] of Object.entries(attribution.marks) as [Placement, readonly Contribution[]][]) {
    if (contributions.length > 0) out.push({ slot, contributions });
  }
  return out;
}

function decorationOf(source: DecorationSource): JournalDecoration | undefined {
  return store.list(source.owner).at(source.index);
}

// The owner's kind alone ("Journal") never distinguishes one journal's rule from another's,
// so the display name always carries the identity too, not just the scope.
function ownerLabel(owner: DecorationOwner): string {
  return match(owner)
    .with({ kind: "journal" }, ({ journalName }) =>
      m.decoration_breakdown_owner({ kind: "journal", name: journalName }),
    )
    .with({ kind: "shelf" }, ({ shelfName }) => m.decoration_breakdown_owner({ kind: "shelf", name: shelfName }))
    .with({ kind: "global" }, () => m.decoration_breakdown_owner({ kind: "global", name: "" }))
    .exhaustive();
}

interface Clause {
  readonly mode: "and" | "or";
  readonly text: string;
}

// Mirrors DecorationsSection.vue's row-clauses: the mode word belongs between conditions, or
// an "or" decoration with two conditions reads as if both had to hold.
function clausesOf(source: DecorationSource): readonly Clause[] {
  const decoration = decorationOf(source);
  if (!decoration) return [];
  return decoration.conditions.map((condition) => ({
    mode: decoration.mode,
    text: describeCondition(condition, calendar),
  }));
}
</script>

<template>
  <div class="decoration-breakdown">
    <UiSettingRow :name="m.decoration_breakdown_date_label()">
      <DatePicker v-model="datePickerModel" picking="day" />
    </UiSettingRow>

    <UiSettingRow :name="m.decoration_breakdown_shelf_label()">
      <UiDropdown v-model="shelfModel">
        <option value="">{{ m.decoration_breakdown_shelf_all() }}</option>
        <option v-for="name in shelfNames" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>

    <p v-if="cells.length === 0" class="decoration-breakdown__empty">{{ m.decoration_breakdown_empty() }}</p>

    <div
      v-for="cell in cells"
      :key="cellId(cell)"
      role="region"
      :aria-labelledby="cellId(cell)"
      class="decoration-breakdown__cell"
    >
      <h3 :id="cellId(cell)" class="decoration-breakdown__heading">
        {{ headingOf(cell) }}
        <span v-if="cell.isEntry" class="decoration-breakdown__entry-badge">{{
          m.decoration_breakdown_entry_badge()
        }}</span>
      </h3>

      <div class="decoration-breakdown__body">
        <DecorationPreview :styles="cell.styles" />

        <ul class="decoration-breakdown__properties">
          <li v-for="property in cell.attribution.properties" :key="property.property">
            <div
              role="group"
              :aria-label="m.decoration_breakdown_property({ property: property.property })"
              class="decoration-breakdown__row"
            >
              <strong>{{ m.decoration_breakdown_property({ property: property.property }) }}</strong>
              <span>{{ ownerLabel(property.winner.source.owner) }}</span>
              <template v-for="(clause, i) in clausesOf(property.winner.source)" :key="i">
                <span v-if="i > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
                <span>{{ clause.text }}</span>
              </template>
            </div>

            <div
              v-if="property.overridden.length > 0"
              role="group"
              :aria-label="
                m.decoration_breakdown_overridden_for({
                  property: m.decoration_breakdown_property({ property: property.property }),
                })
              "
              class="decoration-breakdown__overridden"
            >
              <h4>{{ m.decoration_breakdown_overridden_heading() }}</h4>
              <div v-for="(loser, i) in property.overridden" :key="i" class="decoration-breakdown__row">
                <span>{{ ownerLabel(loser.source.owner) }}</span>
                <template v-for="(clause, j) in clausesOf(loser.source)" :key="j">
                  <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
                  <span>{{ clause.text }}</span>
                </template>
              </div>
            </div>
          </li>
        </ul>

        <div v-if="markGroupsOf(cell.attribution).length > 0" class="decoration-breakdown__marks">
          <h4>{{ m.decoration_breakdown_marks_heading() }}</h4>
          <div
            v-for="group in markGroupsOf(cell.attribution)"
            :key="group.slot"
            role="group"
            :aria-label="m.decoration_breakdown_slot({ slot: group.slot })"
            class="decoration-breakdown__mark-group"
          >
            <strong>{{ m.decoration_breakdown_slot({ slot: group.slot }) }}</strong>
            <div v-for="(mark, i) in group.contributions" :key="i" class="decoration-breakdown__row">
              <span>{{ ownerLabel(mark.source.owner) }}</span>
              <template v-for="(clause, j) in clausesOf(mark.source)" :key="j">
                <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
                <span>{{ clause.text }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.decoration-breakdown__cell {
  padding: var(--size-4-2) 0;
  border-top: 1px solid var(--background-modifier-border);
}
.decoration-breakdown__heading {
  margin: 0 0 var(--size-4-2) 0;
  font-size: 1em;
  display: flex;
  align-items: baseline;
  gap: var(--size-4-2);
}
.decoration-breakdown__entry-badge {
  text-transform: uppercase;
  font-size: 65%;
  color: var(--text-accent);
}
.decoration-breakdown__body {
  display: flex;
  align-items: flex-start;
  gap: var(--size-4-2);
}
.decoration-breakdown__properties {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
}
.decoration-breakdown__row {
  display: flex;
  gap: var(--size-4-2);
  flex-wrap: wrap;
  align-items: baseline;
}
.decoration-breakdown__overridden h4,
.decoration-breakdown__marks h4 {
  margin: 0;
  text-transform: uppercase;
  font-size: 75%;
  color: var(--text-muted);
}
/* Only the condition text reads as overridden; the scope badge (always the row's first
   child) stays legible so the reader can still tell whose rule lost. */
.decoration-breakdown__overridden .decoration-breakdown__row > span:not(:first-child) {
  text-decoration: line-through;
}
.decoration-breakdown__mark-group {
  margin-top: var(--size-4-2);
}
.mode-word {
  text-transform: uppercase;
  font-size: 75%;
}
</style>
