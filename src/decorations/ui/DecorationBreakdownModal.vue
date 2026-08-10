<script setup lang="ts">
import { computed, ref } from "vue";

import { CalendarDate, periodOfKind, type AnchorString, type PeriodKind } from "@/calendar";
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

import { attributeCell } from "../attribute-cell";
import { DecorationsStore } from "../decorations-store";
import { cellKey, DecorationEngine, periodKindForWrite } from "../engine";
import { gatherFixedBindings, gatherIntervalBindings } from "../gather-bindings";

import DecorationBreakdownSection from "./DecorationBreakdownSection.vue";

import type { BreakdownCell } from "./breakdown-cell";

const props = defineProps<{ shelf?: string | null }>();

const journals = useService(JournalsRepository);
const shelves = useService(ShelvesRepository);
const store = useService(DecorationsStore);
const engine = useService(DecorationEngine);
const cycle = useService(CycleService);
const timeline = useService(TimelineService);
const indexVersion = useIndexVersion();

const anchor = ref<AnchorString>(CalendarDate.today().toAnchor());
const datePickerModel = useAnchorField({ anchor, picking: "day" });

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

const cells = computed<readonly BreakdownCell[]>(() => {
  void indexVersion.value;
  const selectedDate = CalendarDate.fromAnchor(anchor.value);

  const kinds = new Set<PeriodKind>(["day"]);
  for (const name of journalNames.value) {
    const opt = journals.get(name);
    if (opt.isSome()) kinds.add(periodKindForWrite(opt.value.write.type));
  }

  const periods = [...kinds].map((kind) => periodOfKind(kind, selectedDate));
  const bindings = gatherFixedBindings(journals, store, { journalNames: journalNames.value, shelf: shelf.value });
  const explained = engine.explainRange(periods, bindings);

  const out: BreakdownCell[] = [];
  for (const cellPeriod of periods) {
    const contributions = explained.get(cellKey(cellPeriod.kind, cellPeriod.anchor.toAnchor()));
    if (!contributions || contributions.length === 0) continue;
    out.push({
      kind: "fixed",
      period: cellPeriod,
      attribution: attributeCell(contributions),
      styles: contributions.map((contribution) => contribution.style),
    });
  }

  for (const name of journalNames.value) {
    const config = journals.get(name).getOrUndefined();
    if (config?.write.type !== "custom") continue;
    const intervalAnchor = cycle.anchorOf(name, selectedDate).getOrUndefined();
    if (intervalAnchor === undefined) continue;
    if (!timeline.contains(name, intervalAnchor)) continue;

    const intervalPeriod = periodForJournal(config.write, intervalAnchor);
    const intervalBindings = gatherIntervalBindings(journals, store, { journalName: name, shelf: shelf.value });
    const intervalContributions = engine
      .explainRange([intervalPeriod], intervalBindings)
      .get(cellKey(intervalPeriod.kind, intervalPeriod.anchor.toAnchor()));
    if (!intervalContributions || intervalContributions.length === 0) continue;

    out.push({
      kind: "interval",
      period: intervalPeriod,
      journalName: name,
      attribution: attributeCell(intervalContributions),
      styles: intervalContributions.map((contribution) => contribution.style),
    });
  }

  return out;
});
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

    <DecorationBreakdownSection v-for="(cell, index) in cells" :key="index" :cell="cell" :index="index" />
  </div>
</template>
