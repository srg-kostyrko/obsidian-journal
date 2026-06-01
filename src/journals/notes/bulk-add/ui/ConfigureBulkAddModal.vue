<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useFieldArray, useForm } from "vee-validate";

import type { FilterCondition } from "@/decorations/config";
import { defaultCondition } from "@/decorations/defaults";
import ConditionItem from "@/decorations/settings/ui/ConditionItem.vue";
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import FolderInput from "@/journals/settings/ui/FolderInput.vue";
import UiButton from "@/ui/UiButton.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { bulkAddParametersSchema, defaultBulkAddParameters, type BulkAddParameters } from "../config";

defineProps<{ journalName: string }>();
const api = useModal<BulkAddParameters>();

const { values, handleSubmit, setFieldValue } = useForm<BulkAddParameters>({
  initialValues: defaultBulkAddParameters(),
  validationSchema: toTypedSchema(bulkAddParametersSchema),
});

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
      <FolderInput :model-value="values.folder" @update:model-value="(v) => setFieldValue('folder', v)" />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_date_place_label() }}</template>
      <select
        class="dropdown"
        :value="values.datePlace"
        @change="
          (e) => setFieldValue('datePlace', (e.target as HTMLSelectElement).value as BulkAddParameters['datePlace'])
        "
      >
        <option value="title">{{ m.bulk_add_date_place_title() }}</option>
        <option value="property">{{ m.bulk_add_date_place_property() }}</option>
      </select>
    </UiSettingRow>

    <UiSettingRow v-if="values.datePlace === 'property'">
      <template #name>{{ m.bulk_add_property_name_label() }}</template>
      <input
        :value="values.propertyName"
        @input="(e) => setFieldValue('propertyName', (e.target as HTMLInputElement).value)"
      />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_date_format_label() }}</template>
      <input
        :value="values.dateFormat"
        @input="(e) => setFieldValue('dateFormat', (e.target as HTMLInputElement).value)"
      />
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_filter_combinator_label() }}</template>
      <select
        class="dropdown"
        :value="values.filterCombinator"
        @change="
          (e) =>
            setFieldValue(
              'filterCombinator',
              (e.target as HTMLSelectElement).value as BulkAddParameters['filterCombinator'],
            )
        "
      >
        <option value="no">{{ m.bulk_add_filter_combinator_no() }}</option>
        <option value="and">{{ m.bulk_add_filter_combinator_and() }}</option>
        <option value="or">{{ m.bulk_add_filter_combinator_or() }}</option>
      </select>
    </UiSettingRow>

    <template v-if="values.filterCombinator !== 'no'">
      <UiSettingRow v-for="(filter, i) of values.filters" :key="i">
        <ConditionItem :name="`filters.${i}`" :condition="filter" />
        <UiIconButton icon="trash" @click="filters.remove(i)" />
      </UiSettingRow>
      <UiSettingRow>
        <UiButton @click="addFilter('title')">{{ m.bulk_add_add_filter_title() }}</UiButton>
        <UiButton @click="addFilter('tag')">{{ m.bulk_add_add_filter_tag() }}</UiButton>
        <UiButton @click="addFilter('property')">{{ m.bulk_add_add_filter_property() }}</UiButton>
      </UiSettingRow>
    </template>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_existing_label() }}</template>
      <select
        class="dropdown"
        :value="values.existingNote"
        @change="
          (e) =>
            setFieldValue('existingNote', (e.target as HTMLSelectElement).value as BulkAddParameters['existingNote'])
        "
      >
        <option value="skip">{{ m.bulk_add_option_skip() }}</option>
        <option value="override">{{ m.bulk_add_option_override() }}</option>
        <option value="merge">{{ m.bulk_add_option_merge() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </select>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_other_folder_label() }}</template>
      <select
        class="dropdown"
        :value="values.otherFolder"
        @change="
          (e) => setFieldValue('otherFolder', (e.target as HTMLSelectElement).value as BulkAddParameters['otherFolder'])
        "
      >
        <option value="keep">{{ m.bulk_add_option_keep() }}</option>
        <option value="move">{{ m.bulk_add_option_move() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </select>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_other_name_label() }}</template>
      <select
        class="dropdown"
        :value="values.otherName"
        @change="
          (e) => setFieldValue('otherName', (e.target as HTMLSelectElement).value as BulkAddParameters['otherName'])
        "
      >
        <option value="keep">{{ m.bulk_add_option_keep() }}</option>
        <option value="rename">{{ m.bulk_add_option_rename() }}</option>
        <option value="ask">{{ m.bulk_add_option_ask() }}</option>
      </select>
    </UiSettingRow>

    <UiSettingRow>
      <template #name>{{ m.bulk_add_dry_run_label() }}</template>
      <UiToggle :model-value="values.dryRun" @update:model-value="(v) => setFieldValue('dryRun', v ?? false)" />
    </UiSettingRow>

    <UiSettingRow>
      <UiButton cta type="submit">{{ m.bulk_add_next() }}</UiButton>
    </UiSettingRow>
  </form>
</template>
