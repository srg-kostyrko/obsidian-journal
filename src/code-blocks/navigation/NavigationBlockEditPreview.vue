<script setup lang="ts">
import { computed } from "vue";
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

const journal = computed(() => plugin.getJournal(props.journalName));
const shelfName = computed(() => journal.value?.shelfName ?? null);

useShelfProvider(shelfName);
</script>

<template>
  <div v-if="journal">
    <div v-for="(row, index) of journal.navBlock.rows" :key="index" class="nav-row">
      <div class="nav-row-wrapper">
        <NavigationBlockRow :journal="journal" :row="row" :ref-date="refDate" :default-format="journal.dateFormat" />
      </div>
      <div class="controls">
        <ObsidianIconButton v-if="index > 0" icon="arrow-up" tooltip="Move up" @click="$emit('move-up', index)" />
        <ObsidianIconButton
          v-if="index < journal.navBlock.rows.length - 1"
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
  border: 1px dotted transparent;
}
.nav-row-wrapper {
  margin: 0 auto;
  width: 40%;
  text-align: center;
}
.controls {
  display: none;
}
.nav-row:hover {
  border-top-color: var(--color-accent);
}
.nav-row:hover .controls {
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
}
</style>
