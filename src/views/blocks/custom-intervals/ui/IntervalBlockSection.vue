<script setup lang="ts">
import { computed } from "vue";

import NavBlockRowsEditor from "@/code-blocks/nav/settings/ui/NavBlockRowsEditor.vue";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsViewModel, type JournalConfig } from "@/journals";
import { icons } from "@/ui/icons";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));
const isCustom = computed(() => config.value?.write.type === "custom");
</script>

<template>
  <NavBlockRowsEditor
    v-if="isCustom"
    :journal-name="journalName"
    field="intervalBlock"
    :title="m.interval_block_section_title()"
    :icon="icons.entity.customInterval"
  />
</template>
