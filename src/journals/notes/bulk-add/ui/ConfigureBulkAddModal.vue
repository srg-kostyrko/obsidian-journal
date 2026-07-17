<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useFieldArray, useForm } from "vee-validate";

import type { FilterCondition } from "@/decorations/config";
import { defaultCondition } from "@/decorations/defaults";
import ConditionItem from "@/decorations/settings/ui/ConditionItem.vue";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { useModal } from "@/infrastructure/host/modals";
import DateFormatPreview from "@/journals/settings/ui/DateFormatPreview.vue";
import FolderInput from "@/journals/settings/ui/FolderInput.vue";
import { JournalsViewModel } from "@/journals/view-model";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { bulkAddParametersSchema, defaultBulkAddParameters, type BulkAddParameters } from "../config";

const { journalName } = defineProps<{ journalName: string }>();
const api = useModal<BulkAddParameters>();
const journalsVM = useService(JournalsViewModel);
const notes = useService(NotesService);

// Prefill the date format from the journal's own format so a non-ISO journal starts from the
// right pattern instead of a hardcoded YYYY-MM-DD (v2 parity).
const journalDateFormat = journalsVM.getJournal(journalName).getOrUndefined()?.dateFormat;

// The folder exists only at runtime, so the schema in config.ts cannot check it; without this the
// typo surfaces as a FolderNotFoundError once the modal has closed, taking the whole form with it.
const { values, defineField, handleSubmit, errorBag } = useForm<BulkAddParameters>({
  initialValues: { ...defaultBulkAddParameters(), ...(journalDateFormat && { dateFormat: journalDateFormat }) },
  validationSchema: toTypedSchema(
    v.pipe(
      bulkAddParametersSchema,
      v.forward(
        v.check((input) => notes.folderExists(input.folder as VaultPath), m.bulk_add_folder_not_found()),
        ["folder"],
      ),
    ),
  ),
});

const [folder] = defineField("folder");
const [datePlace] = defineField("datePlace");
const [propertyName] = defineField("propertyName");
const [dateFormat] = defineField("dateFormat");
const [filterCombinator] = defineField("filterCombinator");
const [existingNote] = defineField("existingNote");
const [otherFolder] = defineField("otherFolder");
const [otherName] = defineField("otherName");
const [dryRun] = defineField("dryRun");

const filters = useFieldArray<FilterCondition>("filters");

function addFilter(type: "title" | "tag" | "property"): void {
  filters.push(defaultCondition(type));
}

const onSubmit = handleSubmit((parameters) => {
  api.submit(parameters);
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow>
      <template #name>{{ m.bulk_add_folder_label() }}</template>
      <template #description>
        <div>{{ m.bulk_add_folder_description() }}</div>
        <span v-for="error of errorBag.folder" :key="error" class="bulk-add-form-error">{{ error }}</span>
      </template>
      <FolderInput v-model="folder" :aria-label="m.bulk_add_folder_label()" />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_date_place_label() }}</template>
      <UiDropdown v-model="datePlace" :aria-label="m.bulk_add_date_place_label()">
        <option value="title">{{ m.bulk_add_date_place_title() }}</option>
        <option value="property">{{ m.bulk_add_date_place_property() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow v-if="values.datePlace === 'property'">
      <template #name>{{ m.common_label_property_name() }}</template>
      <template #description>
        <span v-for="error of errorBag.propertyName" :key="error" class="bulk-add-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="propertyName" :aria-label="m.common_label_property_name()" />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_date_format_label() }}</template>
      <template #description>
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">
          {{ m.common_moment_format_reference() }}
        </a>
        <div>{{ m.bulk_add_date_format_omit_time() }}</div>
        <div v-if="values.datePlace === 'property'">{{ m.bulk_add_date_format_property_note() }}</div>
        <DateFormatPreview :format="values.dateFormat" />
        <span v-for="error of errorBag.dateFormat" :key="error" class="bulk-add-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="dateFormat" :aria-label="m.bulk_add_date_format_label()" />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_filter_combinator_label() }}</template>
      <UiDropdown v-model="filterCombinator" :aria-label="m.bulk_add_filter_combinator_label()">
        <option value="no">{{ m.bulk_add_filter_combinator_no() }}</option>
        <option value="and">{{ m.bulk_add_filter_combinator_and() }}</option>
        <option value="or">{{ m.bulk_add_filter_combinator_or() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <template v-if="values.filterCombinator !== 'no'">
      <UiSettingRow v-for="(filter, i) of values.filters" :key="i">
        <ConditionItem :name="`filters.${i}`" :condition="filter" />
        <UiIconButton :icon="icons.action.delete" @click="filters.remove(i)" />
      </UiSettingRow>
      <UiSettingRow>
        <UiButton @click="addFilter('title')">{{ m.bulk_add_add_filter_title() }}</UiButton>
        <UiButton @click="addFilter('tag')">{{ m.bulk_add_add_filter_tag() }}</UiButton>
        <UiButton @click="addFilter('property')">{{ m.bulk_add_add_filter_property() }}</UiButton>
      </UiSettingRow>
    </template>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_existing_label() }}</template>
      <template #description>{{ m.bulk_add_existing_description({ option: existingNote }) }}</template>
      <UiDropdown v-model="existingNote" :aria-label="m.bulk_add_existing_label()">
        <option value="skip">{{ m.bulk_add_option_skip() }}</option>
        <option value="override">{{ m.bulk_add_option_override() }}</option>
        <option value="merge">{{ m.bulk_add_option_merge() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_other_folder_label() }}</template>
      <UiDropdown v-model="otherFolder" :aria-label="m.bulk_add_other_folder_label()">
        <option value="keep">{{ m.bulk_add_option_keep() }}</option>
        <option value="move">{{ m.bulk_add_option_move() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_other_name_label() }}</template>
      <UiDropdown v-model="otherName" :aria-label="m.bulk_add_other_name_label()">
        <option value="keep">{{ m.bulk_add_option_keep() }}</option>
        <option value="rename">{{ m.bulk_add_option_rename() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_dry_run_label() }}</template>
      <template #description>{{ m.bulk_add_dry_run_description() }}</template>
      <UiToggle v-model="dryRun" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.bulk_add_next() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.bulk-add-form-error {
  color: var(--text-error);
  display: block;
}
</style>
