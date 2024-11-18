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
  return newName.value.length > 0 && newName.value !== props.name && !plugin.hasJournal(newName.value);
});
const showUniqeWarning = computed(() => {
  return newName.value && newName.value !== props.name && !plugin.hasJournal(newName.value);
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
