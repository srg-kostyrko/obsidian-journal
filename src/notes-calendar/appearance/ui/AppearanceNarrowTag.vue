<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";

/** `only`: narrow overrides this value. `own`: narrow keeps a stock value of its own over the wide one. */
const { tag, canApply = false } = defineProps<{ tag: "only" | "own" | null; canApply?: boolean }>();

const emit = defineEmits<{ clear: []; apply: [] }>();
</script>

<template>
  <button
    v-if="tag === 'only'"
    type="button"
    class="appearance-control__tag"
    :title="m.calendar_appearance_narrow_only_clear()"
    @click="emit('clear')"
  >
    {{ m.calendar_appearance_narrow_only() }}
    <UiIcon :name="icons.action.reset" />
  </button>
  <template v-else-if="tag === 'own'">
    <span class="appearance-control__tag">{{ m.calendar_appearance_narrow_own() }}</span>
    <button v-if="canApply" type="button" class="appearance-control__apply" @click="emit('apply')">
      {{ m.calendar_appearance_narrow_apply() }}
    </button>
  </template>
</template>

<style scoped>
.appearance-control__tag {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-1);
  margin-inline-start: var(--size-4-1);
  padding: 0 var(--size-4-1);
  height: auto;
  border-radius: var(--radius-s);
  font-size: var(--font-ui-smaller);
  background-color: var(--background-modifier-hover);
  color: var(--text-accent);
  box-shadow: none;
}
.appearance-control__apply {
  margin-inline-start: var(--size-4-1);
  padding: 0 var(--size-4-1);
  height: auto;
  font-size: var(--font-ui-smaller);
}
</style>
