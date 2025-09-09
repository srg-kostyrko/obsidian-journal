<script lang="ts" setup>
import { useSettingsUi } from "../composables/use-settings-ui";

import GlobalSettings from "./GlobalSettings.vue";
import JournalSettings from "./JournalSettings.vue";
import ShelfSettings from "./ShelfSettings.vue";

const settingsUi = useSettingsUi();
</script>

<template>
  <JournalSettings v-if="settingsUi.selectedJournal" :journal-name="settingsUi.selectedJournal" />
  <ShelfSettings v-else-if="settingsUi.selectedShelf" :shelf-name="settingsUi.selectedShelf" />
  <GlobalSettings v-else />
</template>
