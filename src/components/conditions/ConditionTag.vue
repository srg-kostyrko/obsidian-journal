<script setup lang="ts">
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ObsidianTextInput from "@/components/obsidian/ObsidianTextInput.vue";
import type { JournalDecorationTagCondition, JournalDecorationTitleCondition } from "@/types/settings.types";
import { computed } from "vue";

const props = defineProps<{
  condition: JournalDecorationTagCondition;
}>();

const emit = defineEmits<
  <T extends JournalDecorationTagCondition, K extends keyof T>(
    event: "change",
    change: {
      prop: K;
      value: T[K];
    },
  ) => void
>();

const check = computed({
  get() {
    return props.condition.condition;
  },
  set(value: JournalDecorationTitleCondition["condition"]) {
    emit("change", { prop: "condition", value });
  },
});
const value = computed({
  get() {
    return props.condition.value;
  },
  set(value: string) {
    emit("change", { prop: "value", value });
  },
});
</script>

<template>
  <span class="condition-type">
    {{ condition.type }}
  </span>
  <ObsidianDropdown v-model="check">
    <option value="contains">contains</option>
    <option value="starts-with">starts with</option>
    <option value="ends-with">ends with</option>
  </ObsidianDropdown>
  <ObsidianTextInput v-model="value" />
</template>

<style scoped>
.condition-type {
  text-transform: capitalize;
}
</style>
