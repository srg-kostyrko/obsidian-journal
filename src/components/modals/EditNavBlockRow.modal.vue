<script setup lang="ts">
import type { ColorSettings, NavBlockRow } from "@/types/settings.types";
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import * as v from "valibot";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../obsidian/ObsidianTextInput.vue";
import ObsidianNumberInput from "../obsidian/ObsidianNumberInput.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import ObsidianToggle from "../obsidian/ObsidianToggle.vue";
import FormErrors from "@/components/FormErrors.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ColorPicker from "../ColorPicker.vue";
import { computed } from "vue";
import { usePlugin } from "@/composables/use-plugin";
import { useShelfProvider } from "@/composables/use-shelf";
import { colorScheme } from "@/utils/color";
import { deepCopy } from "@/utils/misc";

const { currentJournal, row } = defineProps<{
  row?: NavBlockRow;
  currentJournal: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "submit", row: NavBlockRow): void;
}>();

const plugin = usePlugin();

const journal = computed(() => {
  return plugin.getJournal(currentJournal);
});
const shelfName = computed(() => journal.value?.shelfName ?? null);

const { journals } = useShelfProvider(shelfName);

const supportedJournals = computed(() => {
  return journals.all.value.map(({ name }) => name).filter((name) => name !== currentJournal);
});

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: row
    ? {
        template: row.template,
        fontSize: row.fontSize,
        bold: row.bold,
        italic: row.italic,
        link: row.link,
        journal: row.journal,
        color: deepCopy(row.color),
        background: deepCopy(row.background),
        addDecorations: row.addDecorations,
      }
    : {
        template: "",
        fontSize: 1,
        bold: false,
        italic: false,
        link: "none",
        journal: "",
        color: { type: "theme", name: "text-normal" },
        background: { type: "transparent" },
        addDecorations: false,
      },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        template: v.pipe(v.string(), v.nonEmpty("Template is required")),
        fontSize: v.number(),
        bold: v.boolean(),
        italic: v.boolean(),
        color: colorScheme,
        background: colorScheme,
        link: v.picklist(["none", "self", "journal", "day", "week", "month", "quarter", "year"]),
        journal: v.string(),
        addDecorations: v.boolean(),
      }),
      v.forward(
        v.partialCheck(
          [["link"], ["journal"]],
          (input) => {
            return input.link === "journal" ? Boolean(input.journal) : true;
          },
          "Please select a journal.",
        ),
        ["journal"],
      ),
    ),
  ),
});

const [template, templateAttrs] = defineField("template");
const [fontSize, fontSizeAttrs] = defineField("fontSize");
const [bold, boldAttrs] = defineField("bold");
const [italic, italicAttrs] = defineField("italic");
const [colorRaw, colorAttrs] = defineField("color");
const [backgroundRaw, backgroundAttrs] = defineField("background");
const [link, linkAttrs] = defineField("link");
const [journalField, journalAttrs] = defineField("journal");
const [addDecorations, addDecorationsAttrs] = defineField("addDecorations");

const color = computed<ColorSettings>({
  get(): ColorSettings {
    return (colorRaw.value as ColorSettings) ?? { type: "transparent" };
  },
  set(color: ColorSettings) {
    colorRaw.value = color;
  },
});

const background = computed<ColorSettings>({
  get(): ColorSettings {
    return (backgroundRaw.value as ColorSettings) ?? { type: "transparent" };
  },
  set(color: ColorSettings) {
    backgroundRaw.value = color;
  },
});

const onSubmit = handleSubmit((values) => {
  emit("submit", values);
  emit("close");
});
</script>

<template>
  <form @submit="onSubmit">
    <ObsidianSetting name="Row template">
      <template #description>
        <FormErrors :errors="errorBag.template" />
      </template>
      <ObsidianTextInput v-model="template" v-bind="templateAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Font size">
      <template #description>
        <FormErrors :errors="errorBag.fontSize" />
      </template>
      <ObsidianNumberInput v-model="fontSize" v-bind="fontSizeAttrs" :min="0.5" :step="0.1" />
    </ObsidianSetting>
    <ObsidianSetting name="Bold">
      <ObsidianToggle v-model="bold" v-bind="boldAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Italic">
      <ObsidianToggle v-model="italic" v-bind="italicAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Text color">
      <template #description>
        <FormErrors :errors="errorBag.color" />
      </template>
      <ColorPicker v-model="color" v-bind="colorAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Background color">
      <ColorPicker v-model="background" v-bind="backgroundAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Link">
      <ObsidianDropdown v-model="link" v-bind="linkAttrs">
        <option value="none">None</option>
        <option value="self">Self</option>
        <option value="journal">Journal</option>
        <option value="day">Day</option>
        <option value="week">Week</option>
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting v-if="link === 'journal'" name="Journal">
      <template #description>
        <FormErrors :errors="errorBag.journal" />
      </template>
      <ObsidianDropdown v-model="journalField" v-bind="journalAttrs">
        <option v-for="journalName of supportedJournals" :key="journalName" :value="journalName">
          {{ journalName }}
        </option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting name="Add decorations">
      <ObsidianToggle v-model="addDecorations" v-bind="addDecorationsAttrs" />
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta type="submit">Save</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>

<style scoped></style>
