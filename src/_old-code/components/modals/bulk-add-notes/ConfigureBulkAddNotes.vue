<script setup lang="ts">
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import * as v from "valibot";
import FolderInput from "@/components/FolderInput.vue";
import ObsidianTextInput from "@/components/obsidian/ObsidianTextInput.vue";
import FormErrors from "../../FormErrors.vue";
import DateFormatPreview from "@/components/DateFormatPreview.vue";
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";
import { computed } from "vue";
import { ref } from "vue";
import type { GenericConditions } from "@/types/settings.types";
import ConditionsList from "@/components/conditions/ConditionsList.vue";
import ObsidianToggle from "@/components/obsidian/ObsidianToggle.vue";
import type { BulkAddPrams } from "./bulk-add-notes.types";
import { usePlugin } from "@/composables/use-plugin";

const plugin = usePlugin();

const { journalName } = defineProps<{
  journalName: string;
}>();
const journal = computed(() => plugin.getJournal(journalName));

const emit = defineEmits<{
  (event: "process", parameters: BulkAddPrams): void;
  (event: "close"): void;
}>();

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: {
    folder: "",
    date_place: "title",
    property_name: "",
    date_format: journal.value?.dateFormat,
    filter_combinator: "no",
    existing_note: "skip",
    other_folder: "keep",
    other_name: "keep",
    dry_run: false,
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        folder: v.string(),
        date_place: v.picklist(["title", "property"]),
        property_name: v.string(),
        date_format: v.pipe(v.string(), v.nonEmpty("Date format is required")),
        filter_combinator: v.picklist(["no", "and", "or"]),
        existing_note: v.picklist(["skip", "override", "merge", "ask"]),
        other_folder: v.picklist(["keep", "move", "ask"]),
        other_name: v.picklist(["keep", "rename", "ask"]),
        dry_run: v.boolean(),
      }),
      v.forward(
        v.partialCheck(
          [["date_place"], ["property_name"]],
          (input) => {
            return input.date_place === "property" ? Boolean(input.property_name) : true;
          },
          "Please enter property name.",
        ),
        ["property_name"],
      ),
    ),
  ),
});

const [folder, folderAttrs] = defineField("folder");
const [datePlace, datePlaceAttrs] = defineField("date_place");
const [propertyName, propertyNameAttrs] = defineField("property_name");
const [dateFormat, dateFormatAttrs] = defineField("date_format");
const [filtersCombination, filtersCombinationAttrs] = defineField("filter_combinator");
const [existingNote, existingNoteAttrs] = defineField("existing_note");
const [otherFolder, otherFolderAttrs] = defineField("other_folder");
const [otherName, otherNameAttrs] = defineField("other_name");
const [dryRun, dryRunAttrs] = defineField("dry_run");

const filters = ref<GenericConditions[]>([]);

function addFilter(filter: GenericConditions) {
  filters.value.push(filter);
}

function changeFilter(index: number, change: { prop: unknown; value: unknown }) {
  // @ts-expect-error temporary fuck it
  filters.value[index][change.prop as keyof GenericConditions] = change.value;
}

function removeFilter(index: number) {
  filters.value.splice(index, 1);
}

const onSubmit = handleSubmit(() => {
  emit("process", {
    folder: folder.value ?? "/",
    date_place: datePlace.value ?? "title",
    property_name: propertyName.value ?? "",
    date_format: dateFormat.value ?? journal.value?.dateFormat ?? "",
    filter_combinator: filtersCombination.value ?? "no",
    filters: filters.value,
    existing_note: existingNote.value ?? "skip",
    other_folder: otherFolder.value ?? "keep",
    other_name: otherName.value ?? "keep",
    dry_run: dryRun.value ?? false,
  });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ObsidianSetting name="Folder" description="">
      <template #description>
        <div>Select folder with existing notes that you want to process</div>
        <FormErrors :errors="errorBag.folder" />
      </template>
      <FolderInput v-model="folder" v-bind="folderAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Take date from">
      <ObsidianDropdown v-model="datePlace" v-bind="datePlaceAttrs">
        <option value="title">Note title</option>
        <option value="property">Property</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting v-if="datePlace === 'property'" name="Property containing date">
      <template #description>
        <FormErrors :errors="errorBag.property_name" />
      </template>
      <ObsidianTextInput v-model="propertyName" v-bind="propertyNameAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Date format">
      <template #description>
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">Syntax reference</a><br />
        If your dates have time component in them - please omit it in format.
        <DateFormatPreview :format="dateFormat ?? ''" />
        <div v-if="datePlace === 'property'">
          Please pay attention that dates might differ from how they are stored. Check format in Source display mode.
        </div>
        <FormErrors :errors="errorBag.date_format" />
      </template>
      <ObsidianTextInput v-model="dateFormat" v-bind="dateFormatAttrs" />
    </ObsidianSetting>

    <ObsidianSetting name="Process">
      <ObsidianDropdown v-model="filtersCombination" v-bind="filtersCombinationAttrs">
        <option value="no">All notes</option>
        <option value="or">Notes that match any filter</option>
        <option value="and">Notes that match all filters</option>
      </ObsidianDropdown>
    </ObsidianSetting>

    <ConditionsList
      v-if="filtersCombination && filtersCombination !== 'no'"
      :conditions="filters"
      :mode="filtersCombination"
      @add-condition="addFilter"
      @change-condition="changeFilter"
      @remove-condition="removeFilter"
    />

    <ObsidianSetting name="If other note with same date exists in journal">
      <ObsidianDropdown v-model="existingNote" v-bind="existingNoteAttrs">
        <option value="skip">Skip note</option>
        <option value="override">Override date connection</option>
        <option value="merge">Merge note content into existing one</option>
        <option value="ask">Ask for action for every such note</option>
      </ObsidianDropdown>
    </ObsidianSetting>

    <ObsidianSetting name="When note name differs from journal settings">
      <ObsidianDropdown v-model="otherName" v-bind="otherNameAttrs">
        <option value="keep">Keep as is</option>
        <option value="rename">Rename</option>
        <option value="ask">Ask for action for every such note</option>
      </ObsidianDropdown>
    </ObsidianSetting>

    <ObsidianSetting name="When note is not in folder from journal setting">
      <ObsidianDropdown v-model="otherFolder" v-bind="otherFolderAttrs">
        <option value="keep">Keep as is</option>
        <option value="move">Move to configured folder</option>
        <option value="ask">Ask for action for every such note</option>
      </ObsidianDropdown>
    </ObsidianSetting>

    <ObsidianSetting name="Dry run?">
      <template #description> Don't change notes, just report potential changes </template>
      <ObsidianToggle v-model="dryRun" v-bind="dryRunAttrs" />
    </ObsidianSetting>

    <ObsidianSetting>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta @click="onSubmit">Start</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>

<style scoped></style>
