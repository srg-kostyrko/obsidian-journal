<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { PlaceJournalFlow } from "../flows/place-journal.flow";
import { ShelvesService } from "../service";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const shelvesService = useService(ShelvesService);

const currentShelf = computed(() => shelvesService.shelfOf(journalName));
const hasShelves = computed(() => shelvesService.hasShelves());

const expanded = ref(false);

function place(): void {
  void flows.invoke(PlaceJournalFlow, { journalName });
}
</script>

<template>
  <UiCollapsibleBlock v-if="hasShelves" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.entity.shelf">{{ m.common_label_shelf() }}</UiIconedRow>
    </template>

    <UiSettingRow :name="m.common_label_shelf()">
      <span>{{ currentShelf === "" ? m.shelf_section_not_on_shelf() : currentShelf }}</span>
      <UiIconButton :icon="icons.action.configure" :tooltip="m.shelf_section_place_tooltip()" @click="place" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>
