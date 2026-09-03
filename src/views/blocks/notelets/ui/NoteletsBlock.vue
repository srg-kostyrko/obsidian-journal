<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { CycleService, JournalsIndex, JournalsRepository, useIndexVersion } from "@/journals";
import { buildNoteletListing, periodBoundsOf } from "@/journals/notelets/listing";
import NoteletList from "@/journals/notelets/ui/NoteletList.vue";
import { periodLabelOf } from "@/journals/notelets/ui/period-label";
import { useNoteletCreation } from "@/journals/notelets/ui/use-notelet-creation";
import { ActiveEntryViewModel } from "@/notes-calendar";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";

import { useViewContext } from "../../../view-context";
import { resolveWindow } from "../../custom-intervals/window-resolution";

import type { BlockInstanceId } from "../../../config";
import type { NoteletsBlockConfig } from "../notelets-block";

const props = defineProps<{ instanceId: BlockInstanceId; config: NoteletsBlockConfig }>();

const context = useViewContext();
const scope = useShelfScope(() => context.shelf.value);
const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);
const cycle = useService(CycleService);
const activeEntry = useService(ActiveEntryViewModel);
const indexVersion = useIndexVersion();

const dependencies = { journals, index, cycle };

const scopedJournals = computed(() => {
  const filter = props.config.journals;
  const names = scope.all.value;
  return filter === undefined || filter.length === 0 ? names : names.filter((name) => filter.includes(name));
});

const followed = computed(() => {
  if (context.refDateOrigin.value !== "follow") return null;
  const active = activeEntry.active.value;
  if (active === null) return null;
  return scopedJournals.value.includes(active.journalName) ? active : null;
});

const resolvedWindow = computed(() => resolveWindow(props.config.window, context.refDate.value));

const listing = computed(() => {
  void indexVersion.value;
  const target = followed.value;
  if (target !== null) {
    return buildNoteletListing(dependencies, {
      kind: "period",
      journalName: target.journalName,
      anchor: target.anchor,
      typeIds: props.config.types,
    });
  }
  return buildNoteletListing(dependencies, {
    kind: "window",
    journalNames: scopedJournals.value,
    start: resolvedWindow.value.start,
    end: resolvedWindow.value.end,
    typeIds: props.config.types,
  });
});

const heading = computed(() => {
  const target = followed.value;
  if (target !== null) {
    const bounds = periodBoundsOf(dependencies, target.journalName, target.anchor);
    if (bounds !== undefined) return periodLabelOf(bounds);
  }
  return periodLabelOf({ ...resolvedWindow.value, kind: props.config.window });
});

const placements = computed(() => {
  const date = CalendarDate.fromAnchor(context.refDate.value);
  return scopedJournals.value.flatMap((journalName) => {
    const anchor = cycle.anchorOf(journalName, date);
    return anchor.isNone() ? [] : [{ journalName, anchor: anchor.value }];
  });
});

const creation = useNoteletCreation(
  () => placements.value,
  () => props.config.types,
);

function createNotelet(event: MouseEvent): void {
  void creation.create(event);
}
</script>

<template>
  <section class="journal-view-notelets" :aria-label="m.view_block_notelets_label()">
    <header class="journal-view-notelets__header">
      <h3 class="journal-view-notelets__heading">{{ heading }}</h3>
      <UiIconButton
        v-if="creation.targets.value.length > 0"
        :icon="icons.action.add"
        :tooltip="m.journal_notelet_list_create()"
        @click="createNotelet"
      />
    </header>
    <NoteletList :listing="listing" />
  </section>
</template>

<style scoped>
.journal-view-notelets {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-view-notelets__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-4-2);
}
.journal-view-notelets__heading {
  margin: 0;
  font-size: var(--font-ui-medium);
}
</style>
