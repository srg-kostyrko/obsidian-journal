<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";

import NavBlockLinesEditor from "./NavBlockLinesEditor.vue";

const { journalName } = defineProps<{ journalName: string }>();
</script>

<template>
  <NavBlockLinesEditor
    :journal-name="journalName"
    field="navBlock"
    :title="m.nav_block_section_title()"
    :icon="icons.entity.navBlock"
    :help="manual.navigation.page"
    navigation
    use-defaults
  />
</template>
