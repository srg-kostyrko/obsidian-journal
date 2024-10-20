<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { pluginSettings$ } from "@/stores/settings.store";

const { currentShelf } = defineProps<{
  currentShelf: string;
}>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "save", shelf: string): void;
}>();

const selectedShelf = ref(currentShelf);
const shelves = computed(() => {
  return Object.values(pluginSettings$.value.shelves).sort();
});

function save() {
  if (selectedShelf.value !== currentShelf) {
    emit("save", selectedShelf.value);
  }
  emit("close");
}
</script>

<template>
  <ObsidianSetting name="Shelf">
    <ObsidianDropdown v-model="selectedShelf">
      <option value="">Not on a shelf</option>
      <option v-for="shelf in shelves" :key="shelf.name" :value="shelf.name">{{ shelf.name }}</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting>
    <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
    <ObsidianButton cta @click="save">Save</ObsidianButton>
  </ObsidianSetting>
</template>

<style scoped></style>
