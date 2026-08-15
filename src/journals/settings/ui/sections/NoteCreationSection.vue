<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import VariableChip from "@/templates/ui/VariableChip.vue";
import I18nWithSlot from "@/ui/I18nWithSlot.vue";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { JournalsViewModel } from "../../../view-model";
import DateFormatPreview from "../DateFormatPreview.vue";
import FolderInput from "../FolderInput.vue";
import NotePathPreview from "../NotePathPreview.vue";
import { useAutoCreateOnEnable } from "../use-auto-create-on-enable";
import { useCollisionCheck } from "../use-collision-check";
import { extractFromDateFormat, extractFromNameTemplate } from "../use-folder-extractor";
import { useInvertibilityCheck } from "../use-invertibility-check";
import VariableReferenceHint from "../VariableReferenceHint.vue";
import { templateHasWrongWeek } from "../wrong-week";
import WrongWeekWarning from "../WrongWeekWarning.vue";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());
useAutoCreateOnEnable(config);

const expanded = ref(true);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");
const isWeekly = computed(() => config.value?.write.type === "week");
const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((source) => source.variable) : [],
);

const invertibility = useInvertibilityCheck(config);
const collision = useCollisionCheck(config);

function applyNameTemplateRecommendation(): void {
  if (config.value) extractFromNameTemplate(config.value);
}
function applyDateFormatRecommendation(): void {
  if (config.value) extractFromDateFormat(config.value);
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.action.addFile">{{ m.journal_edit_section_note_creation() }}</UiIconedRow>
    </template>

    <NotePathPreview :journal-name="journalName" />

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
        <div v-if="collision" class="journal-hint">
          {{ m.journal_edit_name_template_collision_warning(collision) }}
        </div>
        <div v-if="invertibility" class="journal-hint">
          <template v-if="invertibility.kind === 'non-invertible'">
            {{ m.journal_edit_name_template_invertibility_warning(invertibility) }}
          </template>
          <template v-else-if="invertibility.kind === 'cyclic-top'">
            {{ m.journal_edit_name_template_cyclic_top_warning() }}
          </template>
          <template v-else>
            {{ m.journal_edit_name_template_no_anchor_warning() }}
          </template>
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
        <WrongWeekWarning v-if="templateHasWrongWeek(config.folder)" />
      </template>
      <FolderInput v-model="config.folder" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_edit_date_format_label()">
      <template #description>
        <div>
          {{ m.journal_edit_date_format_description() }}
          <code v-pre class="u-pop">{{ date }}</code>
        </div>
        <div>
          <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">
            {{ m.common_moment_format_reference() }}
          </a>
        </div>
        <DateFormatPreview :format="config.dateFormat" />
        <template v-if="isWeekly">
          <div>
            <I18nWithSlot :message="m.journal_edit_date_format_week_date_note">
              <VariableChip name="date" />
            </I18nWithSlot>
          </div>
          <div>
            <I18nWithSlot :message="m.journal_edit_date_format_week_start_note">
              <VariableChip name="start_date" />
            </I18nWithSlot>
          </div>
        </template>
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
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
.journal-recommendation {
  color: var(--text-warning);
  padding: var(--size-2-2) 0;
}
</style>
