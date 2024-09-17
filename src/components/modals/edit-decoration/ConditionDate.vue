<script setup lang="ts">
import { moment } from "obsidian";
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import ObsidianNumberInput from "@/components/obsidian/ObsidianNumberInput.vue";
import type { JournalDecorationDateCondition } from "@/types/settings.types";
import { computed } from "vue";

const props = defineProps<{ condition: JournalDecorationDateCondition }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationDateCondition>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationDateCondition[K];
    },
  ) => void
>();

const day = computed({
  get() {
    return props.condition.day;
  },
  set(value: number) {
    emit("change", { prop: "day", value });
  },
});
const month = computed({
  get() {
    return props.condition.month;
  },
  set(value: number) {
    emit("change", { prop: "month", value });
  },
});
const year = computed({
  get() {
    return props.condition.year;
  },
  set(value: number | null) {
    emit("change", { prop: "year", value });
  },
});
const months = moment().localeData().months();
</script>

<template>
  <ObsidianDropdown v-model="day">
    <option :value="-1">Any day</option>
    <option v-for="i in 31" :key="i" :value="i">{{ i }}</option>
  </ObsidianDropdown>
  <ObsidianDropdown v-model="month">
    <option :value="-1">Any month</option>
    <option v-for="(m, i) in months" :key="i" :value="i">{{ m }}</option>
  </ObsidianDropdown>
  <ObsidianNumberInput v-model="year" placeholder="Any year" />
</template>

<style scoped></style>
