<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import type { CodeBlockProps } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository } from "@/journals";

const { path } = defineProps<CodeBlockProps<Record<string, never>>>();

const index = useService(JournalsIndex);
const journals = useService(JournalsRepository);

const entry = computed(() => index.entryByPath(path));
const journal = computed(() => (entry.value.isSome() ? journals.get(entry.value.value.journalName) : null));
const isConnected = computed(() => entry.value.isSome() && journal.value?.isSome() === true);
</script>

<template>
  <div v-if="!isConnected" class="journal-nav-not-connected">{{ m.code_blocks_nav_not_connected() }}</div>
</template>
