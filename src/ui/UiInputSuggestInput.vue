<script setup lang="ts" generic="TResult">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useService } from "@/infrastructure/di";
import { InputSuggestService, type Disposer, type InputSuggestDefinition } from "@/infrastructure/host";

const props = defineProps<{
  modelValue: string;
  definition: InputSuggestDefinition<TResult>;
  placeholder?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const suggests = useService(InputSuggestService);
const element = ref<HTMLInputElement | null>(null);
let dispose: Disposer | undefined;

onMounted(() => {
  if (element.value) {
    dispose = suggests.attach(element.value, props.definition);
  }
});

onBeforeUnmount(() => {
  dispose?.();
});

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    ref="element"
    type="text"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    spellcheck="false"
    @input="onInput"
  />
</template>
