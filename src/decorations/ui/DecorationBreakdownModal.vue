<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref, toRaw } from "vue";

import { Calendar, CalendarDate, periodOfKind, type AnchorString, type Period, type PeriodKind } from "@/calendar";
import { DatePicker, useAnchorField } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
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

import type { CalendarDecoration, JournalDecoration, JournalDecorationStyle } from "../config";
import type { CalendarDecorationOwner } from "../owner";

const props = defineProps<{ period?: Period }>();

const journals = useService(JournalsRepository);
const shelves = useService(ShelvesRepository);
const store = useService(DecorationsStore);
const engine = useService(DecorationEngine);
const calendar = useService(Calendar);
const indexVersion = useIndexVersion();

const initialPeriod = toRaw(props.period);
const anchor = ref<AnchorString>(
  initialPeriod ? toRaw(initialPeriod.anchor).toAnchor() : CalendarDate.today().toAnchor(),
);
const datePickerModel = useAnchorField({ anchor, picking: "day" });

// Same kind + anchor as the entry-point period identifies "the cell it came from" — a week's
// anchor can coincide with one of its days, so kind must be part of the identity too.
const entryKey = initialPeriod ? cellKey(initialPeriod.kind, initialPeriod.anchor.toAnchor()) : null;

const shelf = ref<string | null>(null);
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

// Ties each section's landmark to its own heading (rather than a synthetic test id), so the
// section is nameable both for assistive tech and for scoping assertions to one cell.
function regionId(p: Period): string {
  return `decoration-breakdown-heading-${p.kind}-${p.anchor.toAnchor()}`;
}

interface BreakdownCell {
  readonly period: Period;
  readonly isEntry: boolean;
  readonly attribution: CellAttribution;
  readonly styles: readonly JournalDecorationStyle[];
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
    // only offset-carrying ones (NotesMonthView.vue), the rest belong to the interval list —
    // a section this modal does not render yet, so anything else is simply not shown here.
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
      period: cellPeriod,
      isEntry: entryKey !== null && cellKey(cellPeriod.kind, cellPeriod.anchor.toAnchor()) === entryKey,
      attribution: attributeCell(contributions),
      styles: contributions.map((contribution) => contribution.style),
    });
  }
  return out;
});

// Marks are additive across nine slots and never compete, so the modal shows every
// contributing mark side by side instead of the winner/overridden framing properties get.
function marksOf(attribution: CellAttribution): readonly Contribution[] {
  return Object.values(attribution.marks).flat();
}

function decorationOf(source: DecorationSource): JournalDecoration | CalendarDecoration | undefined {
  return match(source.owner)
    .with({ kind: "journal" }, ({ journalName }) =>
      journals.get(journalName).getOrUndefined()?.decorations.at(source.index),
    )
    .otherwise((calendarOwner: CalendarDecorationOwner) => store.calendarList(calendarOwner).at(source.index));
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
      :key="`${cell.period.kind}:${cell.period.anchor.toAnchor()}`"
      role="region"
      :aria-labelledby="regionId(cell.period)"
      class="decoration-breakdown__cell"
    >
      <h3 :id="regionId(cell.period)" class="decoration-breakdown__heading">
        {{ m.decoration_breakdown_period_kind({ kind: cell.period.kind }) }} — {{ formatPeriod(cell.period) }}
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
              <span>{{ m.decoration_breakdown_scope({ kind: property.winner.source.owner.kind }) }}</span>
              <template v-for="(clause, i) in clausesOf(property.winner.source)" :key="i">
                <span v-if="i > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
                <span>{{ clause.text }}</span>
              </template>
            </div>

            <div
              v-if="property.overridden.length > 0"
              role="group"
              :aria-label="m.decoration_breakdown_overridden_heading()"
              class="decoration-breakdown__overridden"
            >
              <h4>{{ m.decoration_breakdown_overridden_heading() }}</h4>
              <div v-for="(loser, i) in property.overridden" :key="i" class="decoration-breakdown__row">
                <span>{{ m.decoration_breakdown_scope({ kind: loser.source.owner.kind }) }}</span>
                <template v-for="(clause, j) in clausesOf(loser.source)" :key="j">
                  <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
                  <span>{{ clause.text }}</span>
                </template>
              </div>
            </div>
          </li>
        </ul>

        <div
          v-if="marksOf(cell.attribution).length > 0"
          role="group"
          :aria-label="m.decoration_breakdown_marks_heading()"
          class="decoration-breakdown__marks"
        >
          <h4>{{ m.decoration_breakdown_marks_heading() }}</h4>
          <div v-for="(mark, i) in marksOf(cell.attribution)" :key="i" class="decoration-breakdown__row">
            <span>{{ m.decoration_breakdown_scope({ kind: mark.source.owner.kind }) }}</span>
            <template v-for="(clause, j) in clausesOf(mark.source)" :key="j">
              <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
              <span>{{ clause.text }}</span>
            </template>
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
.mode-word {
  text-transform: uppercase;
  font-size: 75%;
}
</style>
