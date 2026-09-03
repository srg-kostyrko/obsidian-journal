<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import type { CodeBlockProps } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository, useIndexVersion } from "@/journals";
import { noteletTypeByName } from "@/journals/notelets/config";
import { buildNoteletListing, periodBoundsOf } from "@/journals/notelets/listing";
import NoteletList from "@/journals/notelets/ui/NoteletList.vue";
import { periodLabelOf } from "@/journals/notelets/ui/period-label";
import { useNoteletCreation } from "@/journals/notelets/ui/use-notelet-creation";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";

import type { NoteletsFenceConfig } from "../notelets-config";

const { path, config } = defineProps<CodeBlockProps<NoteletsFenceConfig>>();

const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);
const cycle = useService(CycleService);
const indexVersion = useIndexVersion();

const dependencies = { journals, index, cycle };

const host = computed(() => {
  void indexVersion.value;
  const entry = index.entryByPath(path);
  if (entry.isNone()) return null;
  const journal = journals.get(entry.value.journalName);
  return journal.isSome() ? { journalName: entry.value.journalName, anchor: entry.value.anchor } : null;
});

// The fence is scoped to one journal, so a hand-written filter names types rather than
// reciting generated ids; a token that resolves to no type is passed through as an id so a
// copied id keeps working.
const typeIds = computed<readonly string[] | undefined>(() => {
  const target = host.value;
  if (target === null) return;
  const journal = journals.get(target.journalName).getOrUndefined();
  if (journal === undefined) return;
  return config.types.map((token) => {
    const resolved = noteletTypeByName(journal, token);
    return resolved.isSome() ? resolved.value[0] : token;
  });
});

const listing = computed(() => {
  void indexVersion.value;
  const target = host.value;
  if (target === null) return { periods: [], total: 0, qualifyByJournal: false };
  return buildNoteletListing(dependencies, {
    kind: "period",
    journalName: target.journalName,
    anchor: target.anchor,
    typeIds: typeIds.value,
  });
});

const heading = computed(() => {
  const target = host.value;
  if (target === null) return "";
  const bounds = periodBoundsOf(dependencies, target.journalName, target.anchor);
  return bounds === undefined ? "" : periodLabelOf(bounds);
});

const creation = useNoteletCreation(
  () => (host.value === null ? [] : [host.value]),
  () => typeIds.value,
);

function createNotelet(event: MouseEvent): void {
  void creation.create(event);
}
</script>

<template>
  <div class="journal-notelets">
    <div v-if="host === null" class="journal-notelets-not-connected">{{ m.code_blocks_notelets_not_connected() }}</div>
    <template v-else>
      <header class="journal-notelets__header">
        <h3 class="journal-notelets__heading">{{ heading }}</h3>
        <UiIconButton
          v-if="creation.targets.value.length > 0"
          :icon="icons.action.add"
          :tooltip="m.journal_notelet_list_create()"
          :aria-label="m.journal_notelet_list_create()"
          @click="createNotelet"
        />
      </header>
      <NoteletList :listing="listing" />
    </template>
  </div>
</template>

<style scoped>
.journal-notelets {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-notelets__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-4-2);
}
.journal-notelets__heading {
  margin: 0;
  font-size: var(--font-ui-medium);
}
</style>
