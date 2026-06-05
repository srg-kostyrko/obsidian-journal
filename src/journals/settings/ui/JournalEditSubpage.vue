<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { CalendarDate, OpenInterval, type AnchorString } from "@/calendar";
import { DatePicker, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiFileInput from "@/ui/UiFileInput.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { describeWrite } from "../describe-write";
import { EditFrontmatterFieldFlow } from "../flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "../flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import CodeBlockReferenceHint from "./CodeBlockReferenceHint.vue";
import DateFormatPreview from "./DateFormatPreview.vue";
import FolderInput from "./FolderInput.vue";
import FolderPathPreview from "./FolderPathPreview.vue";
import { JournalEditSectionToken } from "./journal-edit-section";
import NoteNamePreview from "./NoteNamePreview.vue";
import TemplatePathPreview from "./TemplatePathPreview.vue";
import TemplaterSupportHint from "./TemplaterSupportHint.vue";
import { useAnchorField } from "./use-anchor-field";
import { extractFromDateFormat, extractFromNameTemplate } from "./use-folder-extractor";
import { useInvertibilityCheck } from "./use-invertibility-check";
import VariableReferenceHint from "./VariableReferenceHint.vue";

import type { JournalConfig, NumberingReset, TimelineEnd } from "../../config";

const { journalName, nav } = defineProps<{ journalName: string; nav: SubpageNav }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const editSections = useService(JournalEditSectionToken).toSorted((a, b) => a.order - b.order);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

watchEffect(() => {
  if (!config.value) nav.back();
});

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");
const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((source) => source.variable) : [],
);

const nameTemplateRef = computed(() => config.value?.nameTemplate ?? "");
const invertibility = useInvertibilityCheck(nameTemplateRef);

function applyNameTemplateRecommendation(): void {
  if (config.value) extractFromNameTemplate(config.value);
}

function applyDateFormatRecommendation(): void {
  if (config.value) extractFromDateFormat(config.value);
}

const writing = computed(() => {
  if (!config.value) return "";
  const desc = describeWrite(config.value.write);
  return m.journal_write({ every: "day", duration: 1, ...desc });
});

const noteCreationOpen = ref(true);
const templatesOpen = ref(false);
const timelineOpen = ref(false);
const sequenceOpen = ref(false);
const frontmatterOpen = ref(false);

function addTemplate(): void {
  if (!config.value) return;
  config.value.templates.push("");
  templatesOpen.value = true;
}

function removeTemplate(index: number): void {
  if (!config.value) return;
  config.value.templates.splice(index, 1);
}

const startPicking = computed<Picking>(() =>
  config.value?.write.type === "custom" ? "day" : (config.value?.write.type ?? "day"),
);

const startAnchorRef = computed<AnchorString>({
  get: () => config.value?.timeline.start ?? ("" as AnchorString),
  set: (v) => {
    if (config.value) config.value.timeline.start = v;
  },
});
const startModel = useAnchorField({ anchor: startAnchorRef, picking: startPicking });

const endAnchorRef = computed<AnchorString>({
  get: () => (config.value?.timeline.end.kind === "date" ? config.value.timeline.end.date : ("" as AnchorString)),
  set: (v) => {
    if (config.value?.timeline.end.kind === "date") config.value.timeline.end.date = v;
  },
});
const endModel = useAnchorField({ anchor: endAnchorRef, picking: startPicking });

const endBounds = computed<OpenInterval | undefined>(() => {
  const start = config.value?.timeline.start;
  return start ? OpenInterval.from(CalendarDate.fromAnchor(start)) : undefined;
});

const numberingAnchorRef = computed<AnchorString>({
  get: () => config.value?.numbering.anchorDate ?? ("" as AnchorString),
  set: (v) => {
    if (config.value) config.value.numbering.anchorDate = v;
  },
});
const numberingAnchorModel = useAnchorField({ anchor: numberingAnchorRef, picking: startPicking });

function clearStart(): void {
  if (config.value && config.value.write.type !== "custom") {
    startModel.value = null;
  }
}

function setEndKind(kind: TimelineEnd["kind"]): void {
  if (!config.value) return;
  if (kind === "never") config.value.timeline.end = { kind: "never" };
  else if (kind === "date") config.value.timeline.end = { kind: "date", date: "" as never };
  else config.value.timeline.end = { kind: "repeats", count: 1 };
}

function setResetKind(kind: NumberingReset["kind"]): void {
  const source = config.value?.numbering.sources[0];
  if (!source) return;
  source.reset = kind === "never" ? { kind: "never" } : { kind: "after", count: 2 };
}

function onSequenceToggle(value: boolean | undefined): void {
  if (!config.value) return;
  config.value.numbering.enabled = value ?? false;
  if (value && config.value.numbering.sources.length === 0) {
    config.value.numbering.sources.push({
      variable: "index",
      frontmatterKey: "journal-index",
      anchorValue: 1,
      reset: { kind: "never" },
    });
  }
}

function rename(): void {
  void flows.invoke(RenameJournalFlow, { journalName });
}
function bulkAdd(): void {
  void flows.invoke(BulkAddFlow, { journalName });
}
function editFm(fieldName: "dateField" | "startDateField" | "endDateField"): void {
  void flows.invoke(EditFrontmatterFieldFlow, { journalName, fieldName });
}
function editSequenceKey(): void {
  void flows.invoke(EditSequencePropertyFlow, { journalName, sourceIndex: 0 });
}
</script>

<template>
  <div v-if="config">
    <UiSettingRow heading>
      <template #name>{{ m.journal_edit_header_title({ name: journalName, writing }) }}</template>
      <UiButton @click="bulkAdd">{{ m.bulk_add_command() }}</UiButton>
      <UiIconButton icon="pencil" :tooltip="m.journal_edit_rename_tooltip()" @click="rename" />
      <UiIconButton icon="chevron-left" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="noteCreationOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="file-plus" />
          <span>{{ m.journal_edit_section_note_creation() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_edit_name_template_label()">
        <template #description>
          <div>{{ m.journal_edit_name_template_description() }}</div>
          <VariableReferenceHint
            context="name-template"
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-cycle="hasCycle"
            :numbering-variable-names="numberingVariableNames"
          />
          <NoteNamePreview :journal-name="journalName" />
          <div v-if="invertibility" class="journal-hint">
            {{ m.journal_edit_name_template_invertibility_warning(invertibility) }}
          </div>
          <div v-if="config.nameTemplate.includes('/')" class="journal-recommendation">
            {{ m.journal_edit_move_to_folder_recommendation_name_template() }}
            <a href="#" @click.prevent="applyNameTemplateRecommendation">
              {{ m.journal_edit_move_to_folder_apply_link() }}
            </a>
          </div>
        </template>
        <UiTextInput v-model="config.nameTemplate" />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_folder_label()">
        <template #description>
          <div>{{ m.journal_edit_folder_description() }}</div>
          <VariableReferenceHint
            context="folder-path"
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-cycle="hasCycle"
            :numbering-variable-names="numberingVariableNames"
          />
          <FolderPathPreview :journal-name="journalName" :folder="config.folder" />
        </template>
        <FolderInput v-model="config.folder" />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_date_format_label()">
        <template #description>
          <div>{{ m.journal_edit_date_format_description({ "{date": config.dateFormat }) }}</div>
          <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">
            {{ m.journal_edit_date_format_moment_doc_link() }}
          </a>
          <DateFormatPreview :format="config.dateFormat" />
          <div v-if="config.dateFormat.includes('/')" class="journal-recommendation">
            {{ m.journal_edit_move_to_folder_recommendation_date_format() }}
            <a href="#" @click.prevent="applyDateFormatRecommendation">
              {{ m.journal_edit_move_to_folder_apply_link() }}
            </a>
          </div>
        </template>
        <UiTextInput v-model="config.dateFormat" />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_confirm_creation_label()">
        <template #description>{{ m.journal_edit_confirm_creation_description() }}</template>
        <UiToggle v-model="config.confirmCreation" />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_auto_create_label()">
        <template #description>
          <div>{{ m.journal_edit_auto_create_description() }}</div>
          <div v-if="config.confirmCreation">{{ m.journal_edit_auto_create_confirmation_skip_note() }}</div>
        </template>
        <UiToggle v-model="config.autoCreate" />
      </UiSettingRow>
    </UiCollapsibleBlock>

    <UiCollapsibleBlock v-model:expanded="templatesOpen">
      <template #trigger>
        <UiIconedRow icon="notepad-text-dashed">
          {{ m.journal_edit_section_templates() }}
          <span class="flair">{{ config.templates.length }}</span>
        </UiIconedRow>
      </template>
      <template #controls>
        <UiButton @click="addTemplate">{{ m.journal_edit_template_add_button() }}</UiButton>
      </template>

      <UiSettingRow>
        <template #description>
          <div>{{ m.journal_edit_templates_description() }}</div>
          <VariableReferenceHint
            context="template-path"
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-cycle="hasCycle"
            :numbering-variable-names="numberingVariableNames"
          />
          <CodeBlockReferenceHint :journal-name="journalName" />
          <TemplaterSupportHint />
        </template>
      </UiSettingRow>

      <template v-for="(_path, index) in config.templates" :key="index">
        <UiSettingRow>
          <UiFileInput v-model="config.templates[index]" :placeholder="m.journal_edit_template_path_placeholder()" />
          <UiIconButton
            icon="trash"
            :tooltip="m.journal_edit_template_remove_tooltip()"
            @click="removeTemplate(index)"
          />
        </UiSettingRow>
        <TemplatePathPreview :journal-name="journalName" :path="config.templates[index] ?? ''" />
      </template>
    </UiCollapsibleBlock>

    <UiCollapsibleBlock v-model:expanded="timelineOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="calendar-range" />
          <span>{{ m.journal_edit_section_timeline() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_edit_start_writing_label()">
        <template #description>
          <div>{{ m.journal_edit_start_writing_description() }}</div>
          <div v-if="config.write.type === 'custom'" class="journal-hint">
            {{ m.journal_edit_start_writing_custom_locked() }}
          </div>
        </template>
        <span v-if="config.write.type === 'custom'">{{ config.write.anchorDate }}</span>
        <template v-else>
          <DatePicker v-model="startModel" :picking="startPicking" />
          <UiIconButton
            v-if="config.timeline.start"
            icon="trash"
            :tooltip="m.common_action_close()"
            @click="clearStart"
          />
        </template>
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_end_writing_label()">
        <template #description>
          <div>{{ m.journal_edit_end_description({ kind: config.timeline.end.kind }) }}</div>
          <div v-if="config.timeline.end.kind === 'repeats' && !config.timeline.start" class="journal-hint">
            {{ m.journal_edit_end_repeats_needs_start_warning() }}
          </div>
        </template>
        <UiDropdown
          :model-value="config.timeline.end.kind"
          @update:model-value="setEndKind($event as TimelineEnd['kind'])"
        >
          <option value="never">{{ m.journal_edit_end_kind({ kind: "never" }) }}</option>
          <option value="date">{{ m.journal_edit_end_kind({ kind: "date" }) }}</option>
          <option value="repeats">{{ m.journal_edit_end_kind({ kind: "repeats" }) }}</option>
        </UiDropdown>
        <DatePicker
          v-if="config.timeline.end.kind === 'date'"
          v-model="endModel"
          :picking="startPicking"
          :bounds="endBounds"
        />
        <UiNumberInput v-if="config.timeline.end.kind === 'repeats'" v-model="config.timeline.end.count" :min="1" />
      </UiSettingRow>
    </UiCollapsibleBlock>

    <UiCollapsibleBlock v-model:expanded="sequenceOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="hash" />
          <span>{{ m.journal_edit_section_sequential_numbers() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_edit_sequence_enabled_label()">
        <template #description>{{ m.journal_edit_sequence_enabled_description() }}</template>
        <UiToggle :model-value="config.numbering.enabled" @update:model-value="onSequenceToggle" />
      </UiSettingRow>

      <template v-if="config.numbering.enabled && config.numbering.sources[0]">
        <UiSettingRow :name="m.journal_edit_anchor_label()">
          <template #description>
            <span v-if="config.timeline.start">{{ m.journal_edit_anchor_start_used() }}</span>
          </template>
          <span v-if="config.timeline.start">{{ config.timeline.start }}</span>
          <DatePicker v-else v-model="numberingAnchorModel" :picking="startPicking" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_start_number_label()">
          <template #description>{{ m.journal_edit_start_number_description() }}</template>
          <UiNumberInput v-model="config.numbering.sources[0].anchorValue" :min="1" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_reset_label()">
          <template #description>{{ m.journal_edit_reset_description() }}</template>
          <UiDropdown
            :model-value="config.numbering.sources[0].reset.kind"
            @update:model-value="setResetKind($event as NumberingReset['kind'])"
          >
            <option value="never">{{ m.journal_edit_reset_option({ kind: "never" }) }}</option>
            <option value="after">{{ m.journal_edit_reset_option({ kind: "after" }) }}</option>
          </UiDropdown>
          <template v-if="config.numbering.sources[0].reset.kind === 'after'">
            <UiNumberInput v-model="config.numbering.sources[0].reset.count" :min="2" />
            <span>{{ m.journal_edit_reset_count_suffix() }}</span>
          </template>
        </UiSettingRow>

        <UiSettingRow
          v-if="!config.timeline.start && config.numbering.sources[0].reset.kind === 'never'"
          :name="m.journal_edit_allow_before_label()"
        >
          <template #description>{{ m.journal_edit_allow_before_description() }}</template>
          <UiToggle v-model="config.numbering.allowBefore" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_sequence_property_label()">
          {{ config.numbering.sources[0].frontmatterKey }}
          <UiIconButton
            icon="pencil"
            :tooltip="`${m.journal_edit_sequence_property_label()} edit`"
            @click="editSequenceKey"
          />
        </UiSettingRow>
      </template>
    </UiCollapsibleBlock>

    <UiCollapsibleBlock v-model:expanded="frontmatterOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="table-properties" />
          <span>{{ m.journal_edit_section_frontmatter() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_fm_field_label({ field: 'dateField' })">
        {{ config.frontmatter.dateField }}
        <UiIconButton
          icon="pencil"
          :tooltip="`${m.journal_fm_field_label({ field: 'dateField' })} edit`"
          @click="editFm('dateField')"
        />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_fm_start_toggle_label()">
        <template #description>{{ m.journal_edit_fm_start_description() }}</template>
        <UiToggle v-model="config.frontmatter.addStartDate" />
      </UiSettingRow>
      <UiSettingRow
        v-if="config.frontmatter.addStartDate"
        :name="m.journal_fm_field_label({ field: 'startDateField' })"
      >
        {{ config.frontmatter.startDateField }}
        <UiIconButton
          icon="pencil"
          :tooltip="`${m.journal_fm_field_label({ field: 'startDateField' })} edit`"
          @click="editFm('startDateField')"
        />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_fm_end_toggle_label()">
        <UiToggle v-model="config.frontmatter.addEndDate" />
      </UiSettingRow>
      <UiSettingRow v-if="config.frontmatter.addEndDate" :name="m.journal_fm_field_label({ field: 'endDateField' })">
        {{ config.frontmatter.endDateField }}
        <UiIconButton
          icon="pencil"
          :tooltip="`${m.journal_fm_field_label({ field: 'endDateField' })} edit`"
          @click="editFm('endDateField')"
        />
      </UiSettingRow>
    </UiCollapsibleBlock>

    <component :is="section.component" v-for="section in editSections" :key="section.key" :journal-name="journalName" />
  </div>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.journal-hint {
  color: var(--text-warning);
}
.journal-recommendation {
  color: var(--text-warning);
  padding: var(--size-2-2) 0;
}
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
