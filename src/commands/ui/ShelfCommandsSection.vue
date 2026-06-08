<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import type { JournalWrite } from "@/journals";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { DeleteCommandFlow } from "../flows/delete-command.flow";
import { EditCommandFlow } from "../flows/edit-command.flow";
import { CommandsRepository } from "../repository";

import CommandList from "./CommandList.vue";

import type { CommandConfig } from "../config";

const { shelfName } = defineProps<{ shelfName: string }>();

const flows = useService(Flows);
const commandsRepo = useService(CommandsRepository);

const entries = computed<readonly [string, CommandConfig, JournalWrite["type"]][]>(() =>
  [...commandsRepo.find().entries()]
    .filter(([, command]) => command.target.kind === "shelf" && command.target.shelfName === shelfName)
    .map(([id, command]): [string, CommandConfig, JournalWrite["type"]] => [
      id,
      command,
      command.target.kind === "shelf" ? command.target.writeType : "day",
    ])
    .toSorted((a, b) => a[1].name.localeCompare(b[1].name)),
);

const expanded = ref(false);

function add(): void {
  void flows.invoke(EditCommandFlow, { target: { kind: "shelf", shelfName, writeType: "day" } });
}
function edit(id: string): void {
  void flows.invoke(EditCommandFlow, { commandId: id, target: { kind: "shelf", shelfName, writeType: "day" } });
}
function remove(id: string): void {
  void flows.invoke(DeleteCommandFlow, { commandId: id });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="terminal">
        {{ m.command_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.command_add()" @click="add" />
    </template>
    <CommandList :entries="entries" :empty-text="m.command_empty({ scope: 'shelf' })" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
