<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import NavBlockRowsEditor from "./NavBlockRowsEditor.vue";

const { journalName } = defineProps<{ journalName: string }>();
</script>

<template>
  <NavBlockRowsEditor
    :journal-name="journalName"
    field="navBlock"
    :title="m.nav_block_section_title()"
    :icon="icons.entity.navBlock"
    mode
    use-defaults
  />
</template>
