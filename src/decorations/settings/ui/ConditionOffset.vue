<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";

const { name } = defineProps<{ name: string }>();
const { value: offset } = useField<number>(`${name}.offset`);

const hint = computed(() =>
  m.decoration_condition_offset_hint({ days: Math.abs(offset.value), side: offset.value < 0 ? "end" : "start" }),
);
</script>

<template>
  <UiNumberInput v-model="offset" />
  <span class="offset-hint">{{ hint }}</span>
</template>

<style scoped>
.offset-hint {
  color: var(--text-muted);
}
</style>
