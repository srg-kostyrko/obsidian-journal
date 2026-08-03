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
import { cellKey, DecorationEngine, periodKindForWrite, type Contribution, type DecorationSource } from "../engine";
import { gatherBindings } from "../gather-bindings";
import { describeCondition } from "../settings/ui/describe-condition";

import DecorationPreview from "./DecorationPreview.vue";

import type { CalendarDecoration, JournalDecoration, JournalDecorationStyle } from "../config";
import type { CalendarDecorationOwner } from "../owner";

const { period } = defineProps<{ period?: Period }>();

const journals = useService(JournalsRepository);
const shelves = useService(ShelvesRepository);
const store = useService(DecorationsStore);
const engine = useService(DecorationEngine);
const calendar = useService(Calendar);
const indexVersion = useIndexVersion();

const initialPeriod = toRaw(period);
const anchor = ref<AnchorString>(
  initialPeriod ? toRaw(initialPeriod.anchor).toAnchor() : CalendarDate.today().toAnchor(),
);
const datePickerModel = useAnchorField({ anchor, picking: "day" });

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

interface BreakdownCell {
  readonly period: Period;
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
  });
  const explained = engine.explainRange(periods, bindings);

  const out: BreakdownCell[] = [];
  for (const cellPeriod of periods) {
    const contributions = explained.get(cellKey(cellPeriod.kind, cellPeriod.anchor.toAnchor()));
    if (!contributions || contributions.length === 0) continue;
    out.push({
      period: cellPeriod,
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

function conditionsOf(source: DecorationSource): string {
  const decoration = decorationOf(source);
  if (!decoration) return "";
  return decoration.conditions.map((condition) => describeCondition(condition, calendar)).join(", ");
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
      class="decoration-breakdown__cell"
    >
      <DecorationPreview :styles="cell.styles" />

      <ul class="decoration-breakdown__properties">
        <li v-for="property in cell.attribution.properties" :key="property.property">
          <div class="decoration-breakdown__winner">
            <strong>{{ m.decoration_breakdown_property({ property: property.property }) }}</strong>
            <span>{{ m.decoration_breakdown_scope({ kind: property.winner.source.owner.kind }) }}</span>
            <span>{{ conditionsOf(property.winner.source) }}</span>
          </div>

          <div v-if="property.overridden.length > 0" class="decoration-breakdown__overridden">
            <span class="decoration-breakdown__overridden-heading">{{
              m.decoration_breakdown_overridden_heading()
            }}</span>
            <div v-for="(loser, i) in property.overridden" :key="i">
              <span>{{ m.decoration_breakdown_scope({ kind: loser.source.owner.kind }) }}</span>
              <span>{{ conditionsOf(loser.source) }}</span>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="marksOf(cell.attribution).length > 0" class="decoration-breakdown__marks">
        <span class="decoration-breakdown__marks-heading">{{ m.decoration_breakdown_marks_heading() }}</span>
        <div v-for="(mark, i) in marksOf(cell.attribution)" :key="i">
          <span>{{ m.decoration_breakdown_scope({ kind: mark.source.owner.kind }) }}</span>
          <span>{{ conditionsOf(mark.source) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.decoration-breakdown__cell {
  display: flex;
  align-items: flex-start;
  gap: var(--size-4-2);
  padding: var(--size-4-2) 0;
  border-top: 1px solid var(--background-modifier-border);
}
.decoration-breakdown__properties {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
}
.decoration-breakdown__winner,
.decoration-breakdown__overridden > div,
.decoration-breakdown__marks > div {
  display: flex;
  gap: var(--size-4-2);
  flex-wrap: wrap;
  align-items: baseline;
}
.decoration-breakdown__overridden-heading,
.decoration-breakdown__marks-heading {
  text-transform: uppercase;
  font-size: 75%;
  color: var(--text-muted);
}
</style>
