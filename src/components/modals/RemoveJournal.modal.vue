<script setup lang="ts">
import { ref } from "vue";
import type { NotesProcessing } from "../../types/settings.types";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";

const emit = defineEmits<{
  (event: "close"): void;
  (event: "remove", noteProcessing: NotesProcessing): void;
}>();

const noteProcessing = ref<NotesProcessing>("keep");

function confirm() {
  emit("remove", noteProcessing.value);
  emit("close");
}
</script>

<template>
  <ObsidianSetting name="Journal notes" description="What to do with notes connected to this journal">
    <ObsidianDropdown v-model="noteProcessing">
      <option value="keep">Keep</option>
      <option value="clear">Clear journal data</option>
      <option value="delete">Delete</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ObsidianSetting>
    <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
    <ObsidianButton cta @click="confirm">Remove</ObsidianButton>
  </ObsidianSetting>
</template>
