<script setup lang="ts">
import { defaultCommand } from "../../defaults";
import type { JournalCommand, JournalSettings } from "../../types/settings.types";
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
import { buildSupportedCommandList, resolveCommandLabel } from "../../journals/journal-commands";
import { computed } from "vue";

const { writeType, commands, command, index } = defineProps<{
  index: number;
  writeType: JournalSettings["write"]["type"];
  command?: JournalCommand;
  commands: JournalCommand[];
}>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "submit", command: JournalCommand, index: number): void;
}>();

const supportedIcons = new Set(getIconIds());
const supportedCommandTypes = computed(() => buildSupportedCommandList(writeType));

function isNameNotUnique(name: string) {
  if (!name) return true;
  return !commands.some((command, i) => command.name === name && i !== index);
}

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: command ? { ...command } : { ...defaultCommand },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        icon: v.string(),
        name: v.pipe(
          v.string(),
          v.nonEmpty("Command name is required"),
          v.check(isNameNotUnique, "Command name should be unique in journal"),
        ),
        type: v.picklist([
          "same",
          "next",
          "previous",
          "same_next_week",
          "same_previous_week",
          "same_next_month",
          "same_previous_month",
          "same_next_year",
          "same_previous_year",
        ]),
        context: v.picklist(["today", "open_note", "only_open_note"]),
        showInRibbon: v.boolean(),
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
const [type, typeAttrs] = defineField("type");
const [context, contextAttrs] = defineField("context");
const [showInRibbon, showInRibbonAttrs] = defineField("showInRibbon");

const supportedCommandTypeOptions = computed(() =>
  supportedCommandTypes.value.map((value) => ({ value, label: resolveCommandLabel(writeType, value, context.value) })),
);

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
    <ObsidianSetting name="When command runs">
      <ObsidianDropdown v-model="type" v-bind="typeAttrs">
        <option
          v-for="commandOption of supportedCommandTypeOptions"
          :key="commandOption.value"
          :value="commandOption.value"
        >
          {{ commandOption.label }}
        </option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting v-if="type !== 'same'" name="Context">
      <template #description>
        Allows to run command only in specific context.<br />
        <div v-if="context == 'open_note'">
          If there is an open journal note - its date will be takes as current, otherwise command will run relative to
          today.
        </div>
        <div v-if="context == 'only_open_note'">
          Will only run when there is an open journal note using its date as current.
        </div>
      </template>
      <ObsidianDropdown v-model="context" v-bind="contextAttrs">
        <option value="today">Today</option>
        <option value="open_note">Currently opened note</option>
        <option value="only_open_note">Only currently opened note</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta type="submit">Save</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>
