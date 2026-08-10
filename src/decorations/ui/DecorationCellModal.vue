<script setup lang="ts">
import { computed, ref, toRaw } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals/repository";
import { useIndexVersion } from "@/journals/use-index-version";
import { ShelvesRepository } from "@/shelves/repository";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { attributeCell } from "../attribute-cell";
import { DecorationsStore } from "../decorations-store";
import { cellKey, DecorationEngine, hasOffsetCondition } from "../engine";
import { gatherBindings } from "../gather-bindings";

import DecorationBreakdownSection from "./DecorationBreakdownSection.vue";

import type { BreakdownCell } from "./breakdown-cell";
import type { BreakdownEntry } from "./breakdown-entry";
import type { DecorationBinding } from "../engine";

const props = defineProps<{ entry: BreakdownEntry; shelf?: string | null }>();

const journals = useService(JournalsRepository);
const shelves = useService(ShelvesRepository);
const store = useService(DecorationsStore);
const engine = useService(DecorationEngine);
const indexVersion = useIndexVersion();

const entry = toRaw(props.entry);
const period = toRaw(entry.period);

const shelf = ref<string | null>(props.shelf ?? null);
const shelfModel = computed<string>({
  get: () => shelf.value ?? "",
  set: (value) => {
    shelf.value = value === "" ? null : value;
  },
});
const shelfNames = computed<readonly string[]>(() => [...shelves.find().map((s) => s.name)]);

const journalNames = computed<readonly string[]>(() => {
  if (shelf.value === null) return [...journals.find().map((journal) => journal.name)];
  return shelves.get(shelf.value).match<readonly string[]>({
    some: (config) => config.journals,
    none: () => [],
  });
});

// An interval and the day cell it starts on share a cell key, and the two are told apart by
// complementary filters: the day grid takes a custom journal's offset-carrying decorations,
// the interval list takes the rest. The entry says which side was clicked.
function bindingsFor(): readonly DecorationBinding[] {
  if (entry.kind === "interval") {
    return gatherBindings(journals, store, {
      journalNames: [entry.journalName],
      shelf: shelf.value,
      includeCalendar: false,
      filter: (binding) => !hasOffsetCondition(binding.decoration),
    });
  }
  return gatherBindings(journals, store, {
    journalNames: journalNames.value,
    shelf: shelf.value,
    includeCalendar: true,
    filter: (binding) => {
      const config = journals.get(binding.journalName).getOrUndefined();
      if (config?.write.type !== "custom") return true;
      return hasOffsetCondition(binding.decoration);
    },
  });
}

const cell = computed<BreakdownCell | null>(() => {
  void indexVersion.value;
  const contributions = engine
    .explainRange([period], bindingsFor())
    .get(cellKey(period.kind, period.anchor.toAnchor()));
  if (!contributions || contributions.length === 0) return null;

  const attribution = attributeCell(contributions);
  const styles = contributions.map((contribution) => contribution.style);
  return entry.kind === "interval"
    ? { kind: "interval", period, journalName: entry.journalName, isEntry: false, attribution, styles }
    : { kind: "fixed", period, isEntry: false, attribution, styles };
});
</script>

<template>
  <div class="decoration-breakdown">
    <UiSettingRow :name="m.decoration_breakdown_shelf_label()">
      <UiDropdown v-model="shelfModel">
        <option value="">{{ m.decoration_breakdown_shelf_all() }}</option>
        <option v-for="name in shelfNames" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>

    <p v-if="cell === null" class="decoration-breakdown__empty">{{ m.decoration_breakdown_cell_empty() }}</p>
    <DecorationBreakdownSection v-else :cell="cell" :index="0" />
  </div>
</template>
