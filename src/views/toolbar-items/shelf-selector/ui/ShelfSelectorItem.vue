<script setup lang="ts">
import { Menu } from "obsidian";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ShelvesRepository } from "@/shelves";
import UiButton from "@/ui/UiButton.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";

defineProps<{ instanceId: BlockInstanceId; config: Record<string, never> }>();

const context = useViewContext();
const shelves = useService(ShelvesRepository);

const hasShelves = computed(() => shelves.count() > 0);
const label = computed(() => context.shelf.value ?? m.common_label_all_journals());

function open(event: MouseEvent): void {
  const menu = new Menu();
  menu.addItem((item) => item.setTitle(m.common_label_all_journals()).onClick(() => context.setShelf(null)));
  for (const shelf of shelves.find().list()) {
    menu.addItem((item) => item.setTitle(shelf.name).onClick(() => context.setShelf(shelf.name)));
  }
  menu.showAtMouseEvent(event);
}
</script>

<template>
  <UiButton v-if="hasShelves" flat @click="open">{{ label }}</UiButton>
</template>
