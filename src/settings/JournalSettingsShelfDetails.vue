<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import RenameShelfModal from "@/components/modals/RenameShelf.modal.vue";
import CreateJournal from "@/components/modals/CreateJournal.modal.vue";
import type { JournalSettings, PluginCommand } from "@/types/settings.types";
import JournalSettingsList from "./JournalSettingsList.vue";
import { usePlugin } from "@/composables/use-plugin";
import CollapsibleBlock from "@/components/CollapsibleBlock.vue";
import IconedRow from "@/components/IconedRow.vue";
import EditPluginCommandModal from "@/components/modals/EditPluginCommand.modal.vue";
import { resolveCommandLabel } from "@/journals/journal-commands";
import { registerPluginCommand, unregisterPluginCommand } from "@/utils/plugin-commands";

const { shelfName } = defineProps<{
  shelfName: string;
}>();
const emit = defineEmits<{
  (event: "back"): void;
  (event: "edit" | "organize" | "bulk-add", name: string): void;
}>();

const plugin = usePlugin();

const commandPrefix = computed(() => `Shelf: ${shelfName}`);
const expandedState = reactive({
  commands: false,
});

const shelf = computed(() => plugin.getShelf(shelfName));
const shelfJournals = computed(() => {
  if (!shelf.value) return [];
  return plugin.getShelfJournals(shelfName);
});

function showRenameModal(): void {
  if (!shelf.value) return;
  new VueModal(plugin, "Rename shelf", RenameShelfModal, {
    name: shelf.value.name,
    onSave(name: string) {
      plugin.renameShelf(shelfName, name);
      emit("organize", name);
    },
  }).open();
}

function create(): void {
  new VueModal(plugin, "Add Journal", CreateJournal, {
    onCreate(name: string, writing: JournalSettings["write"]) {
      if (!shelf.value) return;
      const journal = plugin.createJournal(name, writing);
      shelf.value.journals.push(name);
      journal.shelves.push(shelfName);
      emit("edit", name);
    },
  }).open();
}

function addCommand(): void {
  if (!shelf.value) return;
  new VueModal(plugin, "Add command", EditPluginCommandModal, {
    index: shelf.value.commands.length,
    commands: shelf.value.commands,
    onSubmit: (command: PluginCommand) => {
      if (!shelf.value) return;
      shelf.value.commands.push(command);
      registerPluginCommand(plugin, command, commandPrefix.value, () =>
        plugin.getShelfJournals(shelfName).filter((journal) => journal.type === command.writeType),
      );
      if (!expandedState.commands) {
        expandedState.commands = true;
      }
    },
  }).open();
}
function editCommand(command: PluginCommand, index: number): void {
  if (!shelf.value) return;
  new VueModal(plugin, "Edit command", EditPluginCommandModal, {
    index,
    command,
    commands: shelf.value.commands,
    onSubmit: (newCommand: PluginCommand) => {
      if (!shelf.value) return;
      unregisterPluginCommand(plugin, command, commandPrefix.value);
      registerPluginCommand(plugin, newCommand, commandPrefix.value, () =>
        plugin.getShelfJournals(shelfName).filter((journal) => journal.type === newCommand.writeType),
      );
    },
  }).open();
}
function deleteCommand(index: number): void {
  if (!shelf.value) return;
  const [command] = shelf.value.commands.splice(index, 1);
  if (!command) return;
  unregisterPluginCommand(plugin, command, commandPrefix.value);
}

onMounted(() => {
  if (shelf.value && !shelf.value.commands) {
    shelf.value.commands = [];
  }
});
</script>

<template>
  <div v-if="shelf">
    <ObsidianSetting heading>
      <template #name>
        <IconedRow icon="library"> Configuring {{ shelf.name }} </IconedRow>
      </template>
      <ObsidianIconButton icon="pencil" tooltip="Rename shelf" @click="showRenameModal" />
      <ObsidianIconButton icon="chevron-left" tooltip="Back to list" @click="$emit('back')" />
    </ObsidianSetting>

    <CollapsibleBlock :default-expanded="shelfJournals.length > 0">
      <template #trigger>
        <IconedRow icon="book-open">
          Journals <span class="flair">{{ shelfJournals.length }}</span>
        </IconedRow>
      </template>
      <template #controls>
        <ObsidianIconButton icon="plus" cta tooltip="Create new journal" @click="create" />
      </template>
      <JournalSettingsList
        :journals="shelfJournals"
        @edit="$emit('edit', $event)"
        @bulk-add="$emit('bulk-add', $event)"
      />
    </CollapsibleBlock>

    <CollapsibleBlock v-model:expanded="expandedState.commands">
      <template #trigger>
        <IconedRow icon="terminal">
          Commands
          <span class="flair">{{ shelf.commands.length }}</span>
        </IconedRow>
      </template>
      <template #controls>
        <ObsidianButton @click="addCommand">Add command</ObsidianButton>
      </template>
      <ObsidianSetting v-if="shelf.commands.length === 0">
        <template #description> No commands configured yet. </template>
      </ObsidianSetting>
      <template v-else>
        <ObsidianSetting v-for="(command, index) of shelf.commands" :key="index">
          <template #name>
            {{ command.name }}
          </template>
          <template #description>
            {{ resolveCommandLabel(command.writeType, command.type) }}
          </template>
          <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editCommand(command, index)" />
          <ObsidianIconButton icon="trash-2" tooltip="Delete" @click="deleteCommand(index)" />
        </ObsidianSetting>
      </template>
    </CollapsibleBlock>
  </div>
</template>
