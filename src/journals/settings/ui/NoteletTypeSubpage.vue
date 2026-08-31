<script setup lang="ts">
import { computed, onUnmounted, watchEffect } from "vue";

import NoteletCommandsSection from "@/commands/ui/NoteletCommandsSection.vue";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DeleteNoteletTypeFlow } from "../flows/delete-notelet-type.flow";
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
const journalsEvents = useService(JournalsEventsToken);
const journalsVM = useService(JournalsViewModel);
const type = computed(() => journalsVM.getJournal(journalName).getOrUndefined()?.notelets[typeId]);

// The type half of the route key is an id, so renaming the type never makes it stale — but the
// journal half is a name: follow it before the missing-type guard below reads it as a deletion.
onUnmounted(
  journalsEvents.on("renamed", (oldName, newName) => {
    if (oldName === journalName) nav.replace({ journalName: newName, typeId });
  }),
);

watchEffect(() => {
  if (!type.value) nav.back();
});

function rename(): void {
  void flows.invoke(RenameNoteletTypeFlow, { journalName, typeId });
}

function remove(): void {
  void flows.invoke(DeleteNoteletTypeFlow, { journalName, typeId });
}
</script>

<template>
  <div v-if="type">
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading>
      <template #name>{{ type.name }}</template>
      <UiIconButton :icon="icons.action.edit" :tooltip="m.journal_notelet_rename_tooltip()" @click="rename" />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.journal_notelet_delete_tooltip()" @click="remove" />
    </UiSettingRow>

    <NoteletTypeCreationSection :journal-name="journalName" :type-id="typeId" />
    <TemplatesSection :journal-name="journalName" :type-id="typeId" />
    <PromptsSection :journal-name="journalName" :type-id="typeId" />
    <NoteletCommandsSection :journal-name="journalName" :type-id="typeId" />
  </div>
</template>
