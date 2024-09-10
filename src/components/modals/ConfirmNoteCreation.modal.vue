<script setup lang="ts">
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";

defineProps<{ noteName: string; journalName: string }>();
defineEmits<{
  (event: "confirm", value: boolean): void;
  (event: "close"): void;
}>();
</script>

<template>
  <ObsidianSetting name="About to create new note"></ObsidianSetting>
  <ObsidianSetting name="Journal">
    {{ journalName }}
  </ObsidianSetting>
  <ObsidianSetting name="Note">
    {{ noteName }}
  </ObsidianSetting>
  <ObsidianSetting>
    <ObsidianButton @click="$emit('confirm', false)">Cancel</ObsidianButton>
    <ObsidianButton cta @click="$emit('confirm', true)">Confirm</ObsidianButton>
  </ObsidianSetting>
</template>
