<script setup lang="ts">
import ObsidianNumberInput from "@/components/obsidian/ObsidianNumberInput.vue";
import type { JournalDecorationOffsetCondition } from "@/types/settings.types";
import { computed } from "vue";

const props = defineProps<{ condition: JournalDecorationOffsetCondition }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationOffsetCondition>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationOffsetCondition[K];
    },
  ) => void
>();

const offset = computed({
  get() {
    return props.condition.offset;
  },
  set(value: number) {
    emit("change", { prop: "offset", value });
  },
});
</script>

<template>
  <div><ObsidianNumberInput v-model="offset" /> days from interval {{ offset >= 0 ? "start" : "end" }}</div>
</template>

<style scoped></style>
