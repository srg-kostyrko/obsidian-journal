<script setup lang="ts">
import { ref } from "vue";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { usePlugin } from "@/composables/use-plugin";

const { currentShelf } = defineProps<{
  currentShelf: string;
}>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "save", shelf: string): void;
}>();

const plugin = usePlugin();

const selectedShelf = ref(currentShelf);

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
      <option v-for="shelf in plugin.shelves" :key="shelf.name" :value="shelf.name">{{ shelf.name }}</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting>
    <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
    <ObsidianButton cta @click="save">Save</ObsidianButton>
  </ObsidianSetting>
</template>

<style scoped></style>
