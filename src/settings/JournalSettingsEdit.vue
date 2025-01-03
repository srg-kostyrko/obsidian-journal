<script setup lang="ts">
import { computed, watch } from "vue";
import {
  FRONTMATTER_DATE_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_START_DATE_KEY,
  FRONTMATTER_END_DATE_KEY,
} from "@/constants";
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
import EditCommandModal from "../components/modals/EditCommand.modal.vue";
import EditDecorationModal from "@/components/modals/EditDecoration.modal.vue";
import CalendarDecoration from "@/components/notes-calendar/decorations/CalendarDecoration.vue";
import { VueModal } from "../components/modals/vue-modal";
import DatePicker from "../components/DatePicker.vue";
import RenameJournalModal from "../components/modals/RenameJournal.modal.vue";
import { today } from "@/calendar";
import NavigationBlockEditPreview from "@/code-blocks/navigation/NavigationBlockEditPreview.vue";
import EditNavBlockRowModal from "@/components/modals/EditNavBlockRow.modal.vue";
import JournalShelfModal from "@/components/modals/JournalShelf.modal.vue";
import { usePlugin } from "@/composables/use-plugin";
import CollapsibleBlock from "@/components/CollapsibleBlock.vue";
import IconedRow from "@/components/IconedRow.vue";
import PathPreview from "@/components/PathPreview.vue";
import CodeBlockReferenceHint from "@/components/CodeBlockReferenceHint.vue";
import { getWritingDescription } from "@/utils/journal";
import TemplatePathPreview from "@/components/TemplatePathPreview.vue";
import TemplateInput from "@/components/TemplateInput.vue";
import { resolveCommandLabel, resolveContextDescription } from "@/journals/journal-commands";
import { getDecorationConditionDescription } from "@/utils/journal";
import EditFrontmatterFieldNameModal from "@/components/modals/EditFrontmatterFieldName.vue";
import TemplaterSupportHint from "@/components/TemplaterSupportHint.vue";

const { journalName } = defineProps<{
  journalName: string;
}>();
const emit = defineEmits<{
  (event: "back"): void;
  (event: "edit", journalName: string): void;
}>();

const plugin = usePlugin();
const journal = computed(() => plugin.getJournal(journalName));
const config = computed(() => journal.value?.config.value);

const day = today().day();
const refDate = today().format("YYYY-MM-DD");

const writingDescription = computed(() => {
  if (!journal.value) return "";
  return getWritingDescription(journal.value.config.value.write);
});

function showRenameModal(): void {
  if (!journal.value) return;
  new VueModal(plugin, "Rename journal", RenameJournalModal, {
    name: journal.value.name,
    async onSave(name: string) {
      if (!journal.value) return;
      await plugin.renameJournal(journal.value.name, name);
      emit("edit", name);
    },
  }).open();
}

function place(): void {
  if (!journal.value) return;
  new VueModal(plugin, "Place journal", JournalShelfModal, {
    currentShelf: journal.value.shelfName,
    onSave(shelfName: string) {
      plugin.moveJournal(journalName, shelfName);
    },
  }).open();
}

function addCommand(): void {
  if (!journal.value) return;
  new VueModal(plugin, "Add command", EditCommandModal, {
    index: journal.value.commands.length,
    writeType: journal.value.type,
    commands: journal.value.commands,
    onSubmit: (command: JournalCommand) => {
      if (!journal.value) return;
      journal.value.addCommand(command);
    },
  }).open();
}
function editCommand(command: JournalCommand, index: number): void {
  if (!journal.value) return;
  new VueModal(plugin, "Edit command", EditCommandModal, {
    index,
    writeType: journal.value.type,
    command,
    commands: journal.value.commands,
    onSubmit: (command: JournalCommand) => {
      if (!journal.value) return;
      journal.value.updateCommand(index, command);
    },
  }).open();
}
function deleteCommand(index: number): void {
  if (!journal.value) return;
  journal.value.deleteCommand(index);
}

const DECORATIONS_MODAL_WIDTH = 800;

function addCalendarDecoration() {
  if (!journal.value) return;
  new VueModal(
    plugin,
    "Add calendar decoration",
    EditDecorationModal,
    {
      index: journal.value.decorations.length,
      writeType: journal.value.type,
      onSubmit: (decoration: JournalDecoration) => {
        if (!journal.value) return;
        journal.value.addDecoration(decoration);
      },
    },
    DECORATIONS_MODAL_WIDTH,
  ).open();
}
function editCalendarDecoration(decoration: JournalDecoration, index: number) {
  if (!journal.value) return;
  new VueModal(
    plugin,
    "Add calendar decoration",
    EditDecorationModal,
    {
      index: journal.value.decorations.length,
      writeType: journal.value.type,
      decoration,
      onSubmit: (decoration: JournalDecoration) => {
        if (!journal.value) return;
        journal.value.editDecoration(index, decoration);
      },
    },
    DECORATIONS_MODAL_WIDTH,
  ).open();
}
function deleteHighlight(index: number) {
  if (!journal.value) return;
  journal.value.deleteDecoration(index);
}

function addNavRow() {
  if (!journal.value) return;
  new VueModal(plugin, "Add row to nav block", EditNavBlockRowModal, {
    currentJournal: journal.value.name,
    onSubmit: (row: NavBlockRow) => {
      if (!journal.value) return;
      journal.value.addNavRow(row);
    },
  }).open();
}
function editNavRow(index: number) {
  if (!journal.value) return;
  new VueModal(plugin, "Edit nav block row", EditNavBlockRowModal, {
    currentJournal: journalName,
    row: journal.value.navBlock.rows[index],
    onSubmit: (row: NavBlockRow) => {
      if (!journal.value) return;
      journal.value.editNavRow(index, row);
    },
  }).open();
}
function removeNavRow(index: number) {
  if (!journal.value) return;
  journal.value.deleteNavRow(index);
}
function moveNavRowUp(index: number) {
  if (!journal.value) return;
  journal.value.moveNavRowUp(index);
}
function moveNavRowDown(index: number) {
  if (!journal.value) return;
  journal.value.moveNavRowDown(index);
}

function addCalendarViewBlockRow() {
  if (!journal.value) return;
  new VueModal(plugin, "Add row to calendar view block", EditNavBlockRowModal, {
    currentJournal: journal.value.name,
    onSubmit: (row: NavBlockRow) => {
      if (!journal.value) return;
      journal.value.addCalendarViewRow(row);
    },
  }).open();
}

function editCalendarViewRow(index: number) {
  if (!journal.value) return;
  new VueModal(plugin, "Edit calendar view block row", EditNavBlockRowModal, {
    currentJournal: journalName,
    row: journal.value.calendarViewBlock.rows[index],
    onSubmit: (row: NavBlockRow) => {
      if (!journal.value) return;
      journal.value.editNavRow(index, row);
    },
  }).open();
}
function removeCalendarViewRow(index: number) {
  if (!journal.value) return;
  journal.value.deleteCalendarViewRow(index);
}
function moveCalendarViewRowUp(index: number) {
  if (!journal.value) return;
  journal.value.moveNavRowUp(index);
}
function moveCalendarViewRowDown(index: number) {
  if (!journal.value) return;
  journal.value.moveNavRowDown(index);
}

function editFrontmatterField(fieldName: string) {
  if (!journal.value) return;
  new VueModal(plugin, "Edit frontmatter field", EditFrontmatterFieldNameModal, {
    journalName: journal.value.name,
    fieldName,
  }).open();
}

async function toggleFrontmatterStartDate() {
  if (!journal.value) return;
  await journal.value.toggleFrontmatterStartDate();
}

async function toggleFrontmatterEndDate() {
  if (!journal.value) return;
  await journal.value.toggleFrontmatterEndDate();
}

async function onAutoCreate(value: boolean) {
  if (value) {
    await journal.value?.autoCreate();
  }
}

watch(
  () => journal.value?.config.value.start,
  (value) => {
    if (!journal.value) return;
    if (value) {
      journal.value.config.value.index.anchorDate = value;
    }
  },
);
watch(
  () => journal.value?.config.value.end.type,
  () => {
    if (journal.value?.config.value.end.type === "repeats" && !journal.value.config.value.end.repeats) {
      journal.value.config.value.end.repeats = 1;
    }
  },
);
</script>

<template>
  <div v-if="journal && config">
    <ObsidianSetting heading>
      <template #name> Configuring {{ journal.name }} (writing {{ writingDescription }}) </template>
      <template #description>
        <div v-if="plugin.usesShelves">
          <div v-if="!journal.shelfName">Not on a shelf right not. <a href="#" @click="place">Place</a></div>
          <div v-else>On {{ journal.shelfName }} shelf right now. <a href="#" @click="place">Place elsewhere</a></div>
        </div>
      </template>
      <ObsidianIconButton icon="pencil" tooltip="Rename journal" @click="showRenameModal" />
      <ObsidianIconButton icon="chevron-left" tooltip="Back to list" @click="$emit('back')" />
    </ObsidianSetting>

    <ObsidianSetting name="Start writing on">
      <template #description>
        New notes prior to this date won't be created.
        <div v-if="config.end.type === 'repeats' && !config.start" class="journal-important">
          Start date should be defined for journal that ends after some number of repeats.
        </div>
        <div v-if="config.write.type === 'custom'" class="journal-important">
          Start date for custom intervals cannot be changes as it is used to calcualte interval
        </div>
      </template>
      <DatePicker v-model="config.start" :disabled="config.write.type === 'custom'" />
      <ObsidianIconButton
        v-if="config.start && config.write.type !== 'custom'"
        icon="trash"
        tooltip="Clear start date"
        @click="config.start = ''"
      />
    </ObsidianSetting>

    <ObsidianSetting name="End writing">
      <template #description>
        <div v-if="config.end.type === 'repeats'">After creating this many notes, new notes won't be created.</div>
        <div v-if="config.end.type === 'date'">New notes after this date won't be created.</div>
      </template>
      <ObsidianDropdown v-model="config.end.type">
        <option value="never">Never</option>
        <option value="date">After date</option>
        <option value="repeats">After repeating</option>
      </ObsidianDropdown>
      <DatePicker v-if="config.end.type === 'date'" v-model="config.end.date" />
      <template v-if="config.end.type === 'repeats'">
        <ObsidianNumberInput v-model="config.end.repeats" :min="1" />
        times
      </template>
    </ObsidianSetting>

    <ObsidianSetting name="Index notes">
      <template #description> Allows to assign numbers to notes (ex. Day 1, Day 2, etc.). </template>
      <ObsidianToggle v-model="config.index.enabled" />
    </ObsidianSetting>

    <template v-if="config.index.enabled">
      <ObsidianSetting name="Anchor date">
        <template #description>
          This date is used to connect some number to it for further calculations.<br />
          Start date is used as anchor date if defined.
        </template>
        <div :aria-label="config.start ? 'Start date is used' : ''">
          <DatePicker v-model="config.index.anchorDate" :disabled="!!config.start" />
        </div>
      </ObsidianSetting>
      <ObsidianSetting name="Start number">
        <template #description> This number is used to start numbering notes at anchor date. </template>
        <ObsidianNumberInput v-model="config.index.anchorIndex" :min="1" />
      </ObsidianSetting>

      <ObsidianSetting name="Index change">
        <template #description> Define how index number will change with time. </template>
        <ObsidianDropdown v-model="config.index.type">
          <option value="increment">Constantly increasing</option>
          <option value="reset_after">Resets after</option>
        </ObsidianDropdown>
        <template v-if="config.index.type === 'reset_after'">
          <ObsidianNumberInput v-model="config.index.resetAfter" :min="2" narrow />
          repeats
        </template>
      </ObsidianSetting>
      <ObsidianSetting v-if="!config.start && config.index.type === 'increment'" name="Allow before">
        <template #description> Enabled to index before anchor date. Might result in negative numbers. </template>
        <ObsidianToggle v-model="config.index.allowBefore" />
      </ObsidianSetting>
    </template>

    <ObsidianSetting name="Open note">
      <ObsidianDropdown v-model="config.openMode">
        <option value="active">Replacing active note</option>
        <option value="tab">In new tab</option>
        <option value="split">Adjacent to active note</option>
        <option value="window">In popout window</option>
      </ObsidianDropdown>
    </ObsidianSetting>

    <ObsidianSetting name="Confirm creating new note?">
      <template #description>
        When turned on will show confirmation dialog any time you try navigating to a date that does not have a note
        yet.
      </template>
      <ObsidianToggle v-model="config.confirmCreation" />
    </ObsidianSetting>

    <ObsidianSetting name="Auto-create current notes">
      <template #description>
        When turned on will automatically create notes for current date if they don't exist yet. <br />
        <div v-if="config.confirmCreation">Confirmation dialog won't be shown for autocreated notes.</div>
      </template>
      <ObsidianToggle v-model="config.autoCreate" @update:model-value="onAutoCreate" />
    </ObsidianSetting>

    <ObsidianSetting name="Note name template">
      <template #description>
        Template used to generate new note name.<br />
        <VariableReferenceHint :type="config.write.type" :date-format="journal.dateFormat" />
      </template>
      <ObsidianTextInput v-model="config.nameTemplate" />
    </ObsidianSetting>

    <ObsidianSetting name="Date format">
      <template #description>
        Used to format dates if not defined in variable.<br />
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">Syntax reference</a><br />
        <DateFormatPreview :format="config.dateFormat" />
      </template>
      <ObsidianTextInput v-model="config.dateFormat" />
    </ObsidianSetting>

    <ObsidianSetting name="Folder">
      <template #description>
        New notes will be created in this folder. <br />
        <VariableReferenceHint :type="config.write.type" :date-format="journal.dateFormat" /> <br />
        <template v-if="config.folder && config.folder.includes('{')">
          <PathPreview :journal-name="journalName" />
        </template>
      </template>
      <FolderInput v-model="config.folder" />
    </ObsidianSetting>

    <CollapsibleBlock>
      <template #trigger>
        <IconedRow icon="notepad-text-dashed">
          Templates
          <span class="flair">{{ config.templates.length }}</span>
        </IconedRow>
      </template>
      <template #controls>
        <ObsidianButton @click="config.templates.push('')"> Add template </ObsidianButton>
      </template>
      <ObsidianSetting no-controls>
        <template #description>
          Path to note that will be used as template when creating new notes. <br />
          When multiple templates are configured - first existing will be used. <br />
          <VariableReferenceHint :type="journal.type" :date-format="journal.dateFormat" /><br />
          <CodeBlockReferenceHint :type="journal.type" :journal-name="journalName" />
          <TemplaterSupportHint />
        </template>
      </ObsidianSetting>
      <template v-for="(path, index) in config.templates" :key="index">
        <ObsidianSetting controls-only>
          <TemplateInput v-model="config.templates[index]" class="grow" />
          <ObsidianIconButton icon="trash" tooltip="Remove template" @click="config.templates.splice(index, 1)" />
        </ObsidianSetting>
        <TemplatePathPreview v-if="path.includes('{')" :journal-name="journalName" :path="path" />
      </template>
    </CollapsibleBlock>

    <CollapsibleBlock>
      <template #trigger>
        <IconedRow icon="terminal">
          Commands
          <span class="flair">{{ journal.commands.length }}</span>
        </IconedRow>
      </template>
      <template #controls>
        <ObsidianButton @click="addCommand">Add command</ObsidianButton>
      </template>

      <ObsidianSetting no-controls>
        <template #description>
          <div v-if="plugin.showReloadHint" class="journal-important">
            Please reload Obsidian for changes to take effect.
          </div>
          <div v-else>Changing ribbon settings requires Obsidian restart to take effect.</div>
        </template>
      </ObsidianSetting>
      <ObsidianSetting v-if="journal.commands.length === 0">
        <template #description> No commands configured yet. </template>
      </ObsidianSetting>
      <template v-else>
        <ObsidianSetting v-for="(command, index) of journal.commands" :key="index">
          <template #name>
            {{ command.name }}
          </template>
          <template #description>
            {{ resolveCommandLabel(journal.type, command.type) }}
            {{ resolveContextDescription(journal.type, command.type, command.context) }}
          </template>
          <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editCommand(command, index)" />
          <ObsidianIconButton icon="trash-2" tooltip="Delete" @click="deleteCommand(index)" />
        </ObsidianSetting>
      </template>
    </CollapsibleBlock>

    <CollapsibleBlock>
      <template #trigger>
        <IconedRow icon="paintbrush">
          Calendar decorations
          <span class="flair">{{ journal.decorations.length }}</span>
        </IconedRow>
      </template>
      <template #controls>
        <ObsidianButton @click="addCalendarDecoration">Add decoration</ObsidianButton>
      </template>
      <ObsidianSetting no-controls>
        <template #description> Use decorations to highlight dates in calendar that meet certain conditions. </template>
      </ObsidianSetting>
      <ObsidianSetting v-if="journal.decorations.length === 0">
        <template #description> No calendar decorations configured yet. </template>
      </ObsidianSetting>
      <template v-else>
        <ObsidianSetting v-for="(decoration, index) of journal.decorations" :key="index">
          <template #description>
            <div class="decoration-preview-container">
              <div class="decoration-preview-block">
                <CalendarDecoration class="decoration-preview" :styles="decoration.styles">
                  {{ day }}
                </CalendarDecoration>
              </div>
              when
              <template v-for="(condition, i) of decoration.conditions" :key="i">
                {{ getDecorationConditionDescription(condition) }}
                <span v-if="i > 0">{{ decoration.mode }}</span>
              </template>
            </div>
          </template>
          <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editCalendarDecoration(decoration, index)" />
          <ObsidianIconButton icon="trash-2" tooltip="Delete" @click="deleteHighlight(index)" />
        </ObsidianSetting>
      </template>
    </CollapsibleBlock>

    <CollapsibleBlock>
      <template #trigger>
        <IconedRow icon="signpost-big"> Navigation block </IconedRow>
      </template>
      <template #controls>
        <ObsidianButton @click="addNavRow">Add row</ObsidianButton>
      </template>
      <NavigationBlockEditPreview
        class="nav-block-preview"
        :rows="journal.navBlock.rows"
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
      <ObsidianSetting name="Decorate whole navigation block">
        <ObsidianToggle v-model="journal.navBlock.decorateWholeBlock" />
      </ObsidianSetting>
    </CollapsibleBlock>

    <CollapsibleBlock v-if="journal.type === 'custom'">
      <template #trigger>
        <IconedRow icon="signpost-big"> Calendar View block </IconedRow>
      </template>
      <template #controls>
        <ObsidianButton @click="addCalendarViewBlockRow">Add row</ObsidianButton>
      </template>

      <NavigationBlockEditPreview
        class="nav-block-preview"
        :rows="journal.calendarViewBlock.rows"
        :journal-name="journalName"
        :ref-date="refDate"
        @move-up="moveCalendarViewRowUp"
        @move-down="moveCalendarViewRowDown"
        @edit="editCalendarViewRow"
        @remove="removeCalendarViewRow"
      />

      <ObsidianSetting name="Decorate whole navigation block">
        <ObsidianToggle v-model="journal.calendarViewBlock.decorateWholeBlock" />
      </ObsidianSetting>
    </CollapsibleBlock>

    <CollapsibleBlock>
      <template #trigger>
        <IconedRow icon="table-properties"> Frontmatter </IconedRow>
      </template>

      <ObsidianSetting name="Date property name">
        {{ config.frontmatter.dateField || FRONTMATTER_DATE_KEY }}
        <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editFrontmatterField('dateField')" />
      </ObsidianSetting>

      <ObsidianSetting v-if="config.index.enabled" name="Index property name">
        {{ config.frontmatter.indexField || FRONTMATTER_INDEX_KEY }}
        <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editFrontmatterField('indexField')" />
      </ObsidianSetting>

      <ObsidianSetting name="Add start date property?">
        <template #description>
          In most cases start date is equal to date property. But for weeks journal it might be different for weeks
          start one year and end in other.
        </template>
        <ObsidianToggle
          :model-value="config.frontmatter.addStartDate"
          @update:model-value="toggleFrontmatterStartDate"
        />
      </ObsidianSetting>
      <ObsidianSetting v-if="config.frontmatter.addStartDate" name="Start date property name">
        {{ config.frontmatter.startDateField || FRONTMATTER_START_DATE_KEY }}
        <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editFrontmatterField('startDateField')" />
      </ObsidianSetting>

      <ObsidianSetting name="Add end date property?">
        <ObsidianToggle :model-value="config.frontmatter.addEndDate" @update:model-value="toggleFrontmatterEndDate" />
      </ObsidianSetting>
      <ObsidianSetting v-if="config.frontmatter.addEndDate" name="End date property name">
        {{ config.frontmatter.endDateField || FRONTMATTER_END_DATE_KEY }}
        <ObsidianIconButton icon="pencil" tooltip="Edit" @click="editFrontmatterField('endDateField')" />
      </ObsidianSetting>
    </CollapsibleBlock>
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
  line-height: 1;
  text-align: center;
}
.nav-block-preview {
  margin-bottom: 1em;
}
.decoration-preview-container {
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.decoration-preview-block {
  position: relative;
}
</style>
