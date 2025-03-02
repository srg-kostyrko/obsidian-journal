<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../obsidian/ObsidianTextInput.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { usePlugin } from "@/composables/use-plugin";

const props = defineProps<{
  name: string;
}>();
const emit = defineEmits<{
  (event: "save", name: string): void;
  (event: "close"): void;
}>();

const plugin = usePlugin();

const newName = ref(props.name);

const canSave = computed(() => {
  return newName.value.length > 0 && newName.value !== props.name && !plugin.hasShelf(newName.value);
});
const showUniqueWarning = computed(() => {
  return newName.value && newName.value !== props.name && plugin.hasShelf(newName.value);
});

function save() {
  emit("save", newName.value);
  emit("close");
}
</script>

<template>
  <ObsidianSetting name="New name">
    <template #description>
      <span v-if="showUniqueWarning" class="journal-important">This name is already used.</span>
    </template>
    <ObsidianTextInput v-model="newName" />
  </ObsidianSetting>
  <ObsidianSetting>
    <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
    <ObsidianButton cta :disabled="!canSave" @click="save">Save</ObsidianButton>
  </ObsidianSetting>
</template>

<style scoped></style>
