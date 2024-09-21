<script setup lang="ts">
import { computed, ref } from "vue";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../obsidian/ObsidianTextInput.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { pluginSettings$ } from "@/stores/settings.store";

const props = defineProps<{
  name: string;
}>();
const emit = defineEmits<{
  (e: "save", name: string): void;
  (e: "close"): void;
}>();

const newName = ref(props.name);

const canSave = computed(() => {
  return (
    newName.value.length > 0 &&
    newName.value !== props.name &&
    pluginSettings$.value.journals[newName.value] === undefined
  );
});
const showUniqeWarning = computed(() => {
  return newName.value && newName.value !== props.name && pluginSettings$.value.journals[newName.value] !== undefined;
});

function save() {
  emit("save", newName.value);
  emit("close");
}
</script>

<template>
  <ObsidianSetting name="New name">
    <template #description>
      Renaming journal will require restart if you have ribbon icons and/or commands configured.
      <span v-if="showUniqeWarning" class="journal-important">This name is already used.</span>
    </template>
    <ObsidianTextInput v-model="newName" />
  </ObsidianSetting>
  <ObsidianSetting>
    <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
    <ObsidianButton cta :disabled="!canSave" @click="save">Save</ObsidianButton>
  </ObsidianSetting>
</template>

<style scoped></style>
