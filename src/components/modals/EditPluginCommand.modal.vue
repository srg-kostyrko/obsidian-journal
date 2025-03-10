<script setup lang="ts">
import { defaultPluginCommand } from "../../defaults";
import type { PluginCommand } from "../../types/settings.types";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { toTypedSchema } from "@vee-validate/valibot";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ObsidianTextInput from "../obsidian/ObsidianTextInput.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import IconSelector from "../IconSelector.vue";
import ObsidianToggle from "../obsidian/ObsidianToggle.vue";
import FormErrors from "@/components/FormErrors.vue";
import { getIconIds } from "obsidian";
import { computed } from "vue";

const { commands, command, index } = defineProps<{
  index: number;
  command?: PluginCommand;
  commands: PluginCommand[];
}>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "submit", command: PluginCommand, index: number): void;
}>();

const supportedIcons = new Set(getIconIds());

function isNameNotUnique(name: string) {
  if (!name) return true;
  return !commands.some((command, i) => command.name === name && i !== index);
}

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: command ? { ...command } : { ...defaultPluginCommand },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        icon: v.string(),
        name: v.pipe(
          v.string(),
          v.nonEmpty("Command name is required"),
          v.check(isNameNotUnique, "Command name should be unique"),
        ),
        type: v.picklist(["same", "next", "previous"]),
        writeType: v.picklist(["day", "week", "month", "quarter", "year"]),
        showInRibbon: v.boolean(),
        openMode: v.picklist(["active", "tab", "split", "window"]),
      }),
      v.forward(
        v.partialCheck(
          [["showInRibbon"], ["icon"]],
          (input) => {
            return input.showInRibbon ? supportedIcons.has(input.icon) : true;
          },
          "Icon is required if command is added to ribbon.",
        ),
        ["icon"],
      ),
    ),
  ),
});
const [name, nameAttrs] = defineField("name");
const [icon, iconAttrs] = defineField("icon");
const [writeType, writeTypeAttrs] = defineField("writeType");
const [type, typeAttrs] = defineField("type");
const [showInRibbon, showInRibbonAttrs] = defineField("showInRibbon");
const [openMode, openModeAttrs] = defineField("openMode");

const sameLabels = {
  day: "Today's note",
  week: "This week's note",
  month: "This month's note",
  quarter: "This quarter's note",
  year: "This year's note",
};
const sameLabel = computed(() => sameLabels[writeType.value ?? "day"]);

const onSubmit = handleSubmit((values) => {
  emit("submit", values, index);
  emit("close");
});
</script>

<template>
  <form @submit="onSubmit">
    <ObsidianSetting name="Name">
      <template #description>
        Journal name will be added to command name automatically.
        <FormErrors :errors="errorBag.name" />
      </template>
      <ObsidianTextInput v-model="name" v-bind="nameAttrs" />
    </ObsidianSetting>

    <ObsidianSetting name="Show in ribbon?">
      <ObsidianToggle v-model="showInRibbon" v-bind="showInRibbonAttrs" />
    </ObsidianSetting>
    <ObsidianSetting v-if="showInRibbon" name="Icon">
      <template #description>
        <FormErrors :errors="errorBag.icon" />
      </template>
      <IconSelector v-model="icon" v-bind="iconAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="Note type">
      <ObsidianDropdown v-model="writeType" v-bind="writeTypeAttrs">
        <option value="day">Daily note</option>
        <option value="week">Weekly note</option>
        <option value="month">Monthly note</option>
        <option value="quarter">Quarterly note</option>
        <option value="year">Yearly note</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting name="Open">
      <ObsidianDropdown v-model="type" v-bind="typeAttrs">
        <option value="same">{{ sameLabel }}</option>
        <option value="next">Next {{ sameLabel }} note</option>
        <option value="previous">Last {{ sameLabel }} note</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting name="Open note">
      <ObsidianDropdown v-model="openMode" v-bind="openModeAttrs">
        <option value="active">Replacing active note</option>
        <option value="tab">In new tab</option>
        <option value="split">Adjacent to active note</option>
        <option value="window">In popout window</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta type="submit">Save</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>
