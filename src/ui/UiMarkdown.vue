<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useService } from "@/infrastructure/di";
import { MarkdownRenderService } from "@/infrastructure/host";

const props = defineProps<{ markdown: string; sourcePath: string }>();

const renderer = useService(MarkdownRenderService);
const container = ref<HTMLElement | null>(null);
let dispose: (() => void) | undefined;

function paint(): void {
  if (!container.value) return;
  dispose?.();
  dispose = renderer.render(container.value, props.markdown, props.sourcePath);
}

onMounted(paint);
watch(
  () => [props.markdown, props.sourcePath],
  () => paint(),
);
onBeforeUnmount(() => {
  dispose?.();
  dispose = undefined;
});
</script>

<template>
  <div ref="container" class="journal-markdown" />
</template>
