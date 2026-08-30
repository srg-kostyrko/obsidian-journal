<script setup lang="ts">
import { computed, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { RenameNoteletTypeFlow } from "../flows/rename-notelet-type.flow";

import NoteletTypeCreationSection from "./sections/NoteletTypeCreationSection.vue";
import PromptsSection from "./sections/PromptsSection.vue";
import TemplatesSection from "./sections/TemplatesSection.vue";

const { journalName, typeId, nav } = defineProps<{
  journalName: string;
  typeId: string;
  nav: SubpageNav<{ journalName: string; typeId: string }>;
}>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const type = computed(() => journalsVM.getJournal(journalName).getOrUndefined()?.notelets[typeId]);

// Routed by id, so no rename subscription is needed — the key never goes stale. Only an actual
// deletion pops the page.
watchEffect(() => {
  if (!type.value) nav.back();
});

function rename(): void {
  void flows.invoke(RenameNoteletTypeFlow, { journalName, typeId });
}
</script>

<template>
  <div v-if="type">
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading>
      <template #name>{{ type.name }}</template>
      <UiIconButton :icon="icons.action.edit" :tooltip="m.journal_notelet_rename_tooltip()" @click="rename" />
    </UiSettingRow>

    <NoteletTypeCreationSection :journal-name="journalName" :type-id="typeId" />
    <TemplatesSection :journal-name="journalName" :type-id="typeId" />
    <PromptsSection :journal-name="journalName" :type-id="typeId" />
  </div>
</template>
