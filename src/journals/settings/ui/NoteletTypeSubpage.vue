<script setup lang="ts">
import { computed, watchEffect } from "vue";

import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import NoteletTypeCreationSection from "./sections/NoteletTypeCreationSection.vue";
import PromptsSection from "./sections/PromptsSection.vue";
import TemplatesSection from "./sections/TemplatesSection.vue";

const { journalName, typeId, nav } = defineProps<{
  journalName: string;
  typeId: string;
  nav: SubpageNav<{ journalName: string; typeId: string }>;
}>();

const journalsVM = useService(JournalsViewModel);
const type = computed(() => journalsVM.getJournal(journalName).getOrUndefined()?.notelets[typeId]);

// Routed by id, so no rename subscription is needed — the key never goes stale. Only an actual
// deletion pops the page.
watchEffect(() => {
  if (!type.value) nav.back();
});
</script>

<template>
  <div v-if="type">
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading>
      <template #name>{{ type.name }}</template>
    </UiSettingRow>

    <NoteletTypeCreationSection :journal-name="journalName" :type-id="typeId" />
    <TemplatesSection :journal-name="journalName" :type-id="typeId" />
    <PromptsSection :journal-name="journalName" :type-id="typeId" />
  </div>
</template>
