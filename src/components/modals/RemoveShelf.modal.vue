<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { usePlugin } from "@/composables/use-plugin";

const { shelfName } = defineProps<{
  shelfName: string;
}>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "remove", destination: string): void;
}>();

const plugin = usePlugin();

const destinationShelf = ref("");
const otherShelves = computed(() => {
  return Object.values(plugin.shelves).filter((shelf) => shelf !== shelfName);
});

function confirm() {
  emit("remove", destinationShelf.value);
  emit("close");
}
</script>

<template>
  <ObsidianSetting v-if="otherShelves.length > 0" name="Move journals to">
    <ObsidianDropdown v-model="destinationShelf">
      <option value="">None</option>
      <option v-for="shelf in otherShelves" :key="shelf" :value="shelf">{{ shelf }}</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <p v-else>Journals will be moved out</p>
  <ObsidianSetting>
    <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
    <ObsidianButton cta @click="confirm">Remove</ObsidianButton>
  </ObsidianSetting>
</template>
