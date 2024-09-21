<script setup lang="ts">
import { computed, reactive } from "vue";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../obsidian/ObsidianTextInput.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { type JournalSettings } from "../../types/settings.types";

const state = reactive({
  name: "",
  write: "day" satisfies JournalSettings["write"]["type"],
  touched: {
    name: false,
  },
});

const emit = defineEmits<{
  (event: "create", name: string, write: JournalSettings["write"]): void;
  (event: "close"): void;
}>();

const errors = computed(() => {
  const errors = [];
  if (!state.name && state.touched.name) errors.push("Name is required");
  return errors;
});

function submit() {
  state.touched.name = true;
  if (errors.value.length) return;
  emit("create", state.name, {
    type: state.write as JournalSettings["write"]["type"],
  } as JournalSettings["write"]);
  emit("close");
}
</script>

<template>
  <ObsidianSetting name="Journal name">
    <ObsidianTextInput v-model="state.name" placeholder="ex. Work" @blur="state.touched.name = true" />
  </ObsidianSetting>
  <ObsidianSetting name="I'll be writing">
    <ObsidianDropdown v-model="state.write">
      <option value="day">Daily</option>
      <option value="week">Weekly</option>
      <option value="month">Monthly</option>
      <option value="quarter">Quarterly</option>
      <option value="year">Annually</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <ul class="errors">
    <li v-for="error in errors" :key="error">{{ error }}</li>
  </ul>
  <ObsidianSetting>
    <ObsidianButton @click="emit('close')">Close</ObsidianButton>
    <ObsidianButton cta :disabled="errors.length > 0" @click="submit">Add</ObsidianButton>
  </ObsidianSetting>
</template>

<style scoped>
.errors {
  color: var(--text-error);
  margin: 0 0 10px;
  padding-inline-start: 20px;
}
</style>
