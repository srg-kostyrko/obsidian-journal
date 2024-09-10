<script setup lang="ts">
import { computed } from "vue";
import { journals$ } from "../stores/settings.store";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";

defineEmits<{
  (event: "edit", id: string): void;
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  (event: "remove", id: string): void;
}>();

const journalsList = computed(() => Object.values(journals$.value).toSorted((a, b) => a.name.localeCompare(b.name)));
</script>

<template>
  <p v-if="journalsList.length === 0">No journals configured yet.</p>
  <template v-else>
    <ObsidianSetting v-for="journal of journalsList" :key="journal.id">
      <template #name>
        {{ journal.name }}
        <span class="flair">{{ journal.write.type }}</span>
      </template>
      <template #description>ID: {{ journal.id }}</template>
      <ObsidianIconButton icon="pencil" :tooltip="'Edit ' + journal.name" @click="$emit('edit', journal.id)" />
      <ObsidianIconButton icon="trash-2" :tooltip="'Delete ' + journal.name" @click="$emit('remove', journal.id)" />
    </ObsidianSetting>
  </template>
</template>
