<script setup lang="ts">
import { computed } from "vue";
import { journals$, pluginSettings$ } from "../stores/settings.store";
import { app$ } from "../stores/obsidian.store";
import { canApplyTemplater } from "../utils/template";
import type { JournalCommand } from "../types/settings.types";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../components/obsidian/ObsidianTextInput.vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "../components/obsidian/ObsidianButton.vue";
import ObsidianDropdown from "../components/obsidian/ObsidianDropdown.vue";
import FolderInput from "../components/FolderInput.vue";
import DateFormatPreview from "../components/DateFormatPreview.vue";
import VariableReferenceHint from "../components/VariableReferenceHint.vue";
import EditCommandModal from "./EditCommand.modal.vue";
import { VueModal } from "../components/modals/vue-modal";

const props = defineProps<{
  journalId: string;
}>();
defineEmits(["back"]);

const journal = computed(() => journals$.value[props.journalId]);
const supportsTemplater = canApplyTemplater(app$.value, "<% $>");

function addCommand(): void {
  new VueModal("Add command", EditCommandModal, {
    index: journal.value.commands.length,
    commands: journal.value.commands,
    onSubmit: (command: JournalCommand) => {
      journal.value.commands.push(command);
      pluginSettings$.value.showReloadHint = true;
    },
  }).open();
}
function editCommand(command: JournalCommand, index: number): void {
  new VueModal("Edit command", EditCommandModal, {
    index,
    command,
    commands: journal.value.commands,
    onSubmit: (command: JournalCommand) => {
      journal.value.commands[index] = command;
      pluginSettings$.value.showReloadHint = true;
    },
  }).open();
}
function deleteCommand(index: number): void {
  journal.value.commands.splice(index, 1);
  pluginSettings$.value.showReloadHint = true;
}
</script>

<template>
  <ObsidianSetting heading>
    <template #name>
      Configuring {{ journal.name }}
      <span class="flair">ID: {{ journal.id }}</span>
    </template>
    <ObsidianIconButton icon="chevron-left" tooltip="Back to list" @click="$emit('back')" />
  </ObsidianSetting>
  <ObsidianSetting name="Journal name">
    <ObsidianTextInput v-model="journal.name" />
  </ObsidianSetting>

  <ObsidianSetting name="Open note">
    <ObsidianDropdown v-model="journal.openMode">
      <option value="active">Replacing active note</option>
      <option value="tab">In new tab</option>
      <option value="split">Adjusten to active note</option>
      <option value="window">In popout window</option>
    </ObsidianDropdown>
  </ObsidianSetting>

  <ObsidianSetting name="Note name template">
    <template #description>
      Template used to generate new note name.<br />
      <VariableReferenceHint :type="journal.write.type" :date-format="journal.dateFormat" />
    </template>
    <ObsidianTextInput v-model="journal.nameTemplate" />
  </ObsidianSetting>

  <ObsidianSetting name="Date format">
    <template #description>
      Used to format dates if not defined in variable.<br />
      <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">Syntax reference</a><br />
      <DateFormatPreview :format="journal.dateFormat" />
    </template>
    <ObsidianTextInput v-model="journal.dateFormat" />
  </ObsidianSetting>

  <ObsidianSetting name="Folder">
    <template #description>
      New notes will be created in this folder. <br />
      <VariableReferenceHint :type="journal.write.type" :date-format="journal.dateFormat" />
    </template>
    <FolderInput v-model="journal.folder" />
  </ObsidianSetting>

  <ObsidianSetting name="Templates">
    <template #description>
      Path to note that will be used as template when creating new notes. <br />
      When multiple templates are configured - first existing will be used. <br />
      <VariableReferenceHint :type="journal.write.type" :date-format="journal.dateFormat" /><br />
      TODO this.createCodeBlockReferenceHint(template.descEl);
      <template v-if="supportsTemplater">
        <br />Templater syntax is supported. Check plugin description for more info.
      </template>
    </template>
    <ObsidianIconButton icon="plus" tooltip="Add new template" @click="journal.templates.push('')" />
  </ObsidianSetting>
  <ObsidianSetting v-for="(template, index) in journal.templates" :key="index" controls-only>
    <ObsidianTextInput v-model="journal.templates[index]" class="grow" />
    <ObsidianIconButton icon="trash" tooltip="Remove template" @click="journal.templates.splice(index, 1)" />
  </ObsidianSetting>

  <ObsidianSetting name="Commands" heading>
    <template #description>
      <div v-if="pluginSettings$.showReloadHint" class="journal-important">
        Please reload Obsidian for changes to take effect.
      </div>
      <div v-else>Changing ribbon settings requires Obsidian restart to take effect.</div>
    </template>
    <ObsidianButton @click="addCommand">Add command</ObsidianButton>
  </ObsidianSetting>
  <p v-if="!journal.commands.length">No commands configured yet.</p>
  <template v-else>
    <ObsidianSetting v-for="(command, index) of journal.commands" :key="index">
      <template #name>
        {{ command.name }}
      </template>
      <template #description> {{ command.type }} in {{ command.context }} </template>
      <ObsidianIconButton class="clickable-icon" icon="pencil" tooltip="Edit" @click="editCommand(command, index)" />
      <ObsidianIconButton class="clickable-icon" icon="trash-2" tooltip="Delete" @click="deleteCommand(index)" />
    </ObsidianSetting>
  </template>
</template>

<style scoped>
.grow {
  flex-grow: 1;
}
.journal-important {
  color: var(--text-error);
}
</style>
