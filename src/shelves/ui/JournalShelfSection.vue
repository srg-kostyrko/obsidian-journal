<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { PlaceJournalFlow } from "../flows/place-journal.flow";
import { ShelvesViewModel } from "../view-model";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const shelvesVM = useService(ShelvesViewModel);

const currentShelf = computed(
  () => shelvesVM.shelves.value.find((shelf) => shelf.journals.includes(journalName))?.name ?? "",
);

const expanded = ref(false);

function place(): void {
  void flows.invoke(PlaceJournalFlow, { journalName });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="journal-section-heading">
        <UiIcon name="library" />
        <span>{{ m.common_label_shelf() }}</span>
      </span>
    </template>

    <UiSettingRow :name="m.common_label_shelf()">
      <span>{{ currentShelf === "" ? m.shelf_section_not_on_shelf() : currentShelf }}</span>
      <UiIconButton icon="pencil" :tooltip="m.shelf_section_place_tooltip()" @click="place" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
</style>
