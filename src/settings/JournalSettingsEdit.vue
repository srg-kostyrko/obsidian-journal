<script setup lang="ts">
import { computed, watch } from "vue";
import { journals$, pluginSettings$ } from "../stores/settings.store";
import { app$, plugin$ } from "../stores/obsidian.store";
import { canApplyTemplater } from "../utils/template";
import type { JournalCommand, JournalDecoration, NavBlockRow } from "../types/settings.types";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../components/obsidian/ObsidianTextInput.vue";
import ObsidianNumberInput from "../components/obsidian/ObsidianNumberInput.vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "../components/obsidian/ObsidianButton.vue";
import ObsidianDropdown from "../components/obsidian/ObsidianDropdown.vue";
import ObsidianToggle from "../components/obsidian/ObsidianToggle.vue";
import FolderInput from "../components/FolderInput.vue";
import DateFormatPreview from "../components/DateFormatPreview.vue";
import VariableReferenceHint from "../components/VariableReferenceHint.vue";
import EditCommandModal from "./EditCommand.modal.vue";
import EditDecorationModal from "@/components/modals/EditDecoration.modal.vue";
import CalendarDecoration from "@/components/calendar/CalendarDecoration.vue";
import { VueModal } from "../components/modals/vue-modal";
import DatePicker from "../components/DatePicker.vue";
import RenameJournalModal from "../components/modals/RenameJournal.modal.vue";
import { today } from "@/calendar";
import NavigationBlockEditPreview from "@/code-blocks/navigation/NavigationBlockEditPreview.vue";
import EditNavBlockRowModal from "@/components/modals/EditNavBlockRow.modal.vue";

const props = defineProps<{
  journalName: string;
}>();
const emit = defineEmits<{
  (e: "back"): void;
  (e: "edit", journalName: string): void;
}>();

const day = today().day();
const refDate = today().format("YYYY-MM-DD");

const journal = computed(() => journals$.value[props.journalName]);
const supportsTemplater = canApplyTemplater(app$.value, "<% $>");

function showRenameModal(): void {
  new VueModal("Rename journal", RenameJournalModal, {
    name: journal.value.name,
    onSave(name: string) {
      plugin$.value.renameJournal(props.journalName, name);
      emit("edit", name);
    },
  }).open();
}

function addCommand(): void {
  new VueModal("Add command", EditCommandModal, {
    index: journal.value.commands.length,
    writeType: journal.value.write,
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
    writeType: journal.value.write,
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

function addCalendarDecoration() {
  new VueModal("Add calendar decoration", EditDecorationModal, {
    index: journal.value.decorations.length,
    writeType: journal.value.write,
    onSubmit: (decoration: JournalDecoration) => {
      journal.value.decorations.push(decoration);
    },
  }).open();
}
function editCalendarDecoration(decoration: JournalDecoration, index: number) {
  new VueModal("Add calendar decoration", EditDecorationModal, {
    index: journal.value.decorations.length,
    writeType: journal.value.write,
    decoration,
    onSubmit: (decoration: JournalDecoration) => {
      journal.value.decorations[index] = decoration;
    },
  }).open();
}
function deleteHighlight(index: number) {
  journal.value.decorations.splice(index, 1);
}

function addNavRow() {
  new VueModal("Add row to nav block", EditNavBlockRowModal, {
    currentJournal: props.journalName,
    onSubmit: (row: NavBlockRow) => {
      journal.value.navBlock.rows.push(row);
    },
  }).open();
}
function editNavRow(index: number) {
  new VueModal("Edit nav block row", EditNavBlockRowModal, {
    currentJournal: props.journalName,
    row: journal.value.navBlock.rows[index],
    onSubmit: (row: NavBlockRow) => {
      journal.value.navBlock.rows[index] = row;
    },
  }).open();
}
function removeNavRow(index: number) {
  journal.value.navBlock.rows.splice(index, 1);
}
function moveNavRowUp(index: number) {
  if (index > 0) {
    const tmp = journal.value.navBlock.rows[index];
    journal.value.navBlock.rows[index] = journal.value.navBlock.rows[index - 1];
    journal.value.navBlock.rows[index - 1] = tmp;
  }
}
function moveNavRowDown(index: number) {
  if (index < journal.value.navBlock.rows.length - 1) {
    const tmp = journal.value.navBlock.rows[index];
    journal.value.navBlock.rows[index] = journal.value.navBlock.rows[index + 1];
    journal.value.navBlock.rows[index + 1] = tmp;
  }
}

watch(
  () => journal.value?.start,
  (value) => {
    if (value) {
      journal.value.index.anchorDate = value;
    }
  },
);
watch(
  () => journal.value?.end.type,
  () => {
    if (journal.value?.end.type === "repeats" && !journal.value.end.repeats) {
      journal.value.end.repeats = 1;
    }
  },
);
</script>

<template>
  <div v-if="journal">
    <ObsidianSetting heading>
      <template #name> Configuring {{ journal.name }} </template>
      <ObsidianIconButton icon="pencil" tooltip="Rename journal" @click="showRenameModal" />
      <ObsidianIconButton icon="chevron-left" tooltip="Back to list" @click="$emit('back')" />
    </ObsidianSetting>

    <ObsidianSetting name="Start writing on">
      <template #description>
        New notes prior to this date won't be created.
        <div v-if="journal.end.type === 'repeats' && !journal.start" class="journal-important">
          Start date should be defined for journal that ends after some number of repeats.
        </div>
        <div v-if="journal.write.type === 'custom'" class="journal-important">
          Start date for custom intervals cannot be changes as it is used to calcualte interval
        </div>
      </template>
      <DatePicker v-model="journal.start" :disabled="journal.write.type === 'custom'" />
      <ObsidianIconButton
        v-if="journal.start && journal.write.type !== 'custom'"
        icon="trash"
        tooltip="Clear start date"
        @click="journal.start = ''"
      />
    </ObsidianSetting>

    <ObsidianSetting name="End writing">
      <template #description>
        <div v-if="journal.end.type === 'repeats'">After creating this many notes, new notes won't be created.</div>
        <div v-if="journal.end.type === 'date'">New notes after this date won't be created.</div>
      </template>
      <ObsidianDropdown v-model="journal.end.type">
        <option value="never">Never</option>
        <option value="date">After date</option>
        <option value="repeats">After repeating</option>
      </ObsidianDropdown>
      <DatePicker v-if="journal.end.type === 'date'" v-model="journal.end.date" />
      <template v-if="journal.end.type === 'repeats'">
        <ObsidianNumberInput v-model="journal.end.repeats" :min="1" />
        times
      </template>
    </ObsidianSetting>

    <ObsidianSetting name="Index notes">
      <template #description> Allows to assign numbers to notes (ex. Day 1, Day 2, etc.). </template>
      <ObsidianToggle v-model="journal.index.enabled" />
    </ObsidianSetting>

    <template v-if="journal.index.enabled">
      <ObsidianSetting name="Anchor date">
        <template #description>
          This date is used to connect some number to it for further calculations.<br />
          Start date is used as anchor date if defined.
        </template>
        <div :aria-label="journal.start ? 'Start date is used' : ''">
          <DatePicker v-model="journal.index.anchorDate" :disabled="!!journal.start" />
        </div>
      </ObsidianSetting>
      <ObsidianSetting name="Start number">
        <template #description> This number is used to start numbering notes at anchor date. </template>
        <ObsidianNumberInput v-model="journal.index.anchorIndex" :min="1" />
      </ObsidianSetting>

      <ObsidianSetting name="Index change">
        <template #description> Define how index number will change with time. </template>
        <ObsidianDropdown v-model="journal.index.type">
          <option value="increment">Constantly increasing</option>
          <option value="reset_after">Resets after</option>
        </ObsidianDropdown>
        <template v-if="journal.index.type === 'reset_after'">
          <ObsidianNumberInput v-model="journal.index.resetAfter" :min="2" narrow />
          repeats
        </template>
      </ObsidianSetting>
      <ObsidianSetting v-if="!journal.start && journal.index.type === 'increment'" name="Allow before">
        <template #description> Enabled to index before anchor date. Might result in negative numbers. </template>
        <ObsidianToggle v-model="journal.index.allowBefore" />
      </ObsidianSetting>
    </template>

    <ObsidianSetting name="Open note">
      <ObsidianDropdown v-model="journal.openMode">
        <option value="active">Replacing active note</option>
        <option value="tab">In new tab</option>
        <option value="split">Adjusten to active note</option>
        <option value="window">In popout window</option>
      </ObsidianDropdown>
    </ObsidianSetting>

    <ObsidianSetting name="Confirm creating new note?">
      <template #description>
        When turned on will show confirmation dialog any time you try navigating to a date that does not have a note
        yet.
      </template>
      <ObsidianToggle v-model="journal.confirmCreation" />
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
        <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editCommand(command, index)" />
        <ObsidianIconButton icon="trash-2" tooltip="Delete" @click="deleteCommand(index)" />
      </ObsidianSetting>
    </template>

    <ObsidianSetting heading name="Calendar decorations">
      <template #description> Use decorations to highlight dates in calendar that meet certain conditions. </template>
      <ObsidianButton @click="addCalendarDecoration">Add decoration</ObsidianButton>
    </ObsidianSetting>
    <p v-if="!journal.decorations.length">No calendar decorations configured yet.</p>
    <template v-else>
      <ObsidianSetting v-for="(decoration, index) of journal.decorations" :key="index">
        <template #name>
          <CalendarDecoration class="decoration-preview" :styles="decoration.styles">{{ day }}</CalendarDecoration>
          when
          <template v-for="(condition, i) of decoration.conditions" :key="i">
            {{ condition.type }}
            <span v-if="i > 0">{{ decoration.mode }}</span>
          </template>
        </template>
        <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editCalendarDecoration(decoration, index)" />
        <ObsidianIconButton icon="trash-2" tooltip="Delete" @click="deleteHighlight(index)" />
      </ObsidianSetting>
    </template>

    <ObsidianSetting heading name="Navigation block">
      <ObsidianButton @click="addNavRow">Add row</ObsidianButton>
    </ObsidianSetting>
    <NavigationBlockEditPreview
      class="nav-block-preview"
      :journal-name="journalName"
      :ref-date="refDate"
      @move-up="moveNavRowUp"
      @move-down="moveNavRowDown"
      @edit="editNavRow"
      @remove="removeNavRow"
    />
    <ObsidianSetting name="Navigation block mode">
      <ObsidianDropdown v-model="journal.navBlock.type">
        <option value="create">Create new note</option>
        <option value="existing">Open existing note</option>
      </ObsidianDropdown>
    </ObsidianSetting>
  </div>
</template>

<style scoped>
.grow {
  flex-grow: 1;
}
.journal-important {
  color: var(--text-error);
}
.decoration-preview {
  display: inline-block;
  font-size: 1.5em;
  width: 1.5em;
  height: 1.5em;
  padding: 0.25em;
  text-align: center;
}
.nav-block-preview {
  margin-bottom: 1em;
}
</style>
