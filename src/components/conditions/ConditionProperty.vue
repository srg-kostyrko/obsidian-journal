<script setup lang="ts">
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ObsidianTextInput from "@/obsidian/components/ObsidianTextInput.vue";
import type { JournalDecorationPropertyCondition } from "@/types/settings.types";
import { computed } from "vue";

const props = defineProps<{
  condition: JournalDecorationPropertyCondition;
}>();
const emit = defineEmits<
  <K extends keyof JournalDecorationPropertyCondition>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationPropertyCondition[K];
    },
  ) => void
>();

const name = computed({
  get() {
    return props.condition.name;
  },
  set(value: string) {
    emit("change", { prop: "name", value });
  },
});
const check = computed({
  get() {
    return props.condition.condition;
  },
  set(value: JournalDecorationPropertyCondition["condition"]) {
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
const showValueField = computed(() => {
  return props.condition.condition !== "exists" && props.condition.condition !== "does-not-exist";
});
</script>

<template>
  Property
  <ObsidianTextInput v-model="name" />
  <ObsidianDropdown v-model="check">
    <option value="exists">exists</option>
    <option value="does-not-exist">does not exist</option>
    <option value="eq">equals</option>
    <option value="neq">does not equal</option>
    <option value="contains">contains</option>
    <option value="does-not-contain">does not contain</option>
    <option value="starts-with">starts with</option>
    <option value="ends-with">ends with</option>
  </ObsidianDropdown>
  <ObsidianTextInput v-if="showValueField" v-model="value" />
</template>

<style scoped></style>
