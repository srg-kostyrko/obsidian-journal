<script setup lang="ts">
import { computed } from "vue";

import NavBlockLinesEditor from "@/code-blocks/nav/settings/ui/NavBlockLinesEditor.vue";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals";
import { icons } from "@/ui/icons";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());
const isCustom = computed(() => config.value?.write.type === "custom");
</script>

<template>
  <NavBlockLinesEditor
    v-if="isCustom"
    :journal-name="journalName"
    field="intervalBlock"
    :title="m.interval_block_section_title()"
    :icon="icons.entity.customInterval"
  />
</template>
