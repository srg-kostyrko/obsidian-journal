<script setup lang="ts">
import { computed } from "vue";
import { journals$ } from "@/stores/settings.store";
import NavigationBlockRow from "./NavigationBlockRow.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { usePlugin } from "@/composables/use-plugin";
import { useShelfProvider } from "@/composables/use-shelf";

const props = defineProps<{
  refDate: string;
  journalName: string;
}>();

defineEmits<(event: "move-up" | "move-down" | "edit" | "remove", index: number) => void>();

const plugin = usePlugin();

const journalSettings = computed(() => journals$.value[props.journalName]);
const journal = computed(() => plugin.getJournal(props.journalName));

useShelfProvider(journalSettings.value?.shelves[0]);
</script>

<template>
  <div v-if="journal">
    <div v-for="(row, index) of journalSettings.navBlock.rows" :key="index" class="nav-row">
      <div class="nav-row-wrapper">
        <NavigationBlockRow
          :journal="journal"
          :row="row"
          :ref-date="refDate"
          :default-format="journalSettings.dateFormat"
        />
      </div>
      <div class="controls">
        <ObsidianIconButton v-if="index > 0" icon="arrow-up" tooltip="Move up" @click="$emit('move-up', index)" />
        <ObsidianIconButton
          v-if="index < journalSettings.navBlock.rows.length - 1"
          icon="arrow-down"
          tooltip="Move down"
          @click="$emit('move-down', index)"
        />
        <ObsidianIconButton icon="pencil" tooltip="Edit" @click="$emit('edit', index)" />
        <ObsidianIconButton icon="trash-2" tooltip="Delete" @click="$emit('remove', index)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.nav-row {
  display: flex;
  position: relative;
}
.nav-row-wrapper {
  margin: 0 auto;
  width: 40%;
  text-align: center;
}
.controls {
  display: none;
}

.nav-row:hover .controls {
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
}
</style>
