<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { journalConfigCollection, type JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

import { commandCollection, type CommandConfig } from "../config";

import CommandList from "./CommandList.vue";
import { DeleteCommandFlow } from "./delete-command.flow";
import { EditCommandFlow } from "./edit-command.flow";

const { journalName } = defineProps<{ journalName: string }>();

const settings = useService(SettingsService);
const flows = useService(Flows);
const collection = settings.getCollection(commandCollection);
const journals = settings.getCollection(journalConfigCollection);

const writeType = computed<JournalWrite["type"]>(() => journals.get(journalName)?.write.type ?? "day");

const entries = computed<readonly [string, CommandConfig, JournalWrite["type"]][]>(() =>
  Object.entries(collection.entries)
    .filter(([, command]) => command.target.kind === "journal" && command.target.journalName === journalName)
    .map(([id, command]): [string, CommandConfig, JournalWrite["type"]] => [id, command, writeType.value])
    .toSorted((a, b) => a[1].name.localeCompare(b[1].name)),
);

const expanded = ref(false);

function add(): void {
  void flows.invoke(EditCommandFlow, { target: { kind: "journal", journalName } });
}
function edit(id: string): void {
  void flows.invoke(EditCommandFlow, { commandId: id, target: { kind: "journal", journalName } });
}
function remove(id: string): void {
  void flows.invoke(DeleteCommandFlow, { commandId: id });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="terminal">
        {{ m.command_journal_section_title() }}
        <span class="flair">{{ entries.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton icon="plus" cta :tooltip="m.command_journal_add()" @click="add" />
    </template>
    <CommandList :entries="entries" :empty-text="m.command_journal_empty()" @edit="edit" @delete="remove" />
  </UiCollapsibleBlock>
</template>
