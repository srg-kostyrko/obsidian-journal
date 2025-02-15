<script setup lang="ts">
import { computed } from "vue";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "../components/obsidian/ObsidianDropdown.vue";
import ObsidianToggle from "@/components/obsidian/ObsidianToggle.vue";
import JournalSettingsWithoutShelves from "./JournalSettingsWithoutShelves.vue";
import JournalSettingsWithShelves from "./JournalSettingsWithShelves.vue";
import CollapsibleBlock from "@/components/CollapsibleBlock.vue";
import { usePlugin } from "@/composables/use-plugin";
import IconedRow from "@/components/IconedRow.vue";
import ColorPicker from "@/components/ColorPicker.vue";
import CalendarWeekSettings from "@/components/CalendarWeekSettings.vue";
import type { Journal } from "@/journals/journal";
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import MigrationModal from "@/migrations/components/MigrationModal.vue";

const emit = defineEmits<(event: "edit" | "organize" | "bulk-add", name: string) => void>();

const plugin = usePlugin();

const collidingJournals = computed(() => {
  const hashed = new Map<string, Journal[]>();
  for (const journal of plugin.journals) {
    const hash = `${journal.config.value.nameTemplate.replaceAll("{{journal_name}}", journal.name)}-${journal.config.value.folder}-${journal.config.value.dateFormat}`;
    const list = hashed.get(hash) ?? [];
    list.push(journal);
    hashed.set(hash, list);
  }
  return [...hashed.values()].filter((list) => list.length > 1);
});

function migrate() {
  new VueModal(plugin, "Migrate plugin data", MigrationModal).open();
}
</script>

<template>
  <div v-if="plugin.hasMigrations" class="journal-warning">
    <ObsidianSetting name="Some data is pending migration" heading>
      <ObsidianButton cta @click="migrate">Migrate</ObsidianButton>
    </ObsidianSetting>
  </div>

  <ObsidianSetting name="Use shelves?">
    <template #description> # TODO add description </template>
    <ObsidianToggle v-model="plugin.usesShelves" />
  </ObsidianSetting>

  <div v-if="collidingJournals.length > 0" class="journal-warning">
    <ObsidianSetting name="Colliding journal settings" heading />
    <div v-for="(journals, index) in collidingJournals" :key="index">
      Journals {{ journals.map((j) => j.name).join(" and ") }} has colliding configurations so that notes will be
      overriding each other. Consider changing folder or name template in one of that journals.
    </div>
  </div>

  <JournalSettingsWithShelves
    v-if="plugin.usesShelves"
    @organize="emit('organize', $event)"
    @edit="emit('edit', $event)"
    @bulk-add="emit('bulk-add', $event)"
  />
  <JournalSettingsWithoutShelves v-else @edit="emit('edit', $event)" @bulk-add="emit('bulk-add', $event)" />

  <ObsidianSetting name="Open on startup" descripton="Open a note whenever you open this vault?">
    <ObsidianDropdown v-model="plugin.openOnStartup">
      <option value="">Don't open</option>
      <option v-for="journal of plugin.journals" :key="journal.name" :value="journal.name">
        {{ journal.name }}
      </option>
    </ObsidianDropdown>
  </ObsidianSetting>

  <CollapsibleBlock>
    <template #trigger>
      <IconedRow icon="calendar"> Calendar view </IconedRow>
    </template>
    <CalendarWeekSettings />
    <ObsidianSetting name="Show calendar in">
      <ObsidianDropdown v-model="plugin.calendarViewSettings.leaf">
        <option value="left">Left sidebar</option>
        <option value="right">Right sidebar</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting name="Show weeks">
      <ObsidianDropdown v-model="plugin.calendarViewSettings.weeks">
        <option value="none">Don't show</option>
        <option value="left">Before weekdays</option>
        <option value="right">After weekdays</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting name="Today button">
      <ObsidianDropdown v-model="plugin.calendarViewSettings.todayMode">
        <option value="create">Creates today's note if doesn't exist</option>
        <option value="navigate">Opens today's note if it exists</option>
        <option value="switch_date">Just switch calendar view to current month</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting name="Pick date button">
      <ObsidianDropdown v-model="plugin.calendarViewSettings.pickMode">
        <option value="create">Creates note for picked date if doesn't exist</option>
        <option value="navigate">Opens note for picked date if it exists</option>
        <option value="switch_date">Just switch calendar view to month containing corresponding date</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting name="Highlighting today" header />
    <ObsidianSetting name="Text color">
      <ColorPicker v-model="plugin.calendarViewSettings.todayStyle.color" />
    </ObsidianSetting>
    <ObsidianSetting name="Background color">
      <ColorPicker v-model="plugin.calendarViewSettings.todayStyle.background" />
    </ObsidianSetting>
    <ObsidianSetting name="Highlighting active note" header />
    <ObsidianSetting name="Text color">
      <ColorPicker v-model="plugin.calendarViewSettings.activeStyle.color" />
    </ObsidianSetting>
    <ObsidianSetting name="Background color">
      <ColorPicker v-model="plugin.calendarViewSettings.activeStyle.background" />
    </ObsidianSetting>
  </CollapsibleBlock>
</template>

<style scoped>
.journal-warning {
  border: 1px solid var(--text-error);
  padding: var(--size-2-2);
}
.journal-warning :deep(.setting-item) {
  padding: 0;
}
.journal-warning :deep(.setting-item--heading .setting-item-name) {
  color: var(--text-error);
}
</style>
