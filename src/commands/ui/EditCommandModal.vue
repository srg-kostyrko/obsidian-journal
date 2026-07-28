<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { getIconIds } from "obsidian";
import { match } from "ts-pattern";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { JournalsViewModel, type JournalWrite } from "@/journals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { commandCollection, type CommandConfig, type CommandTarget } from "../config";
import { supportedTypes } from "../resolve";

import { commandTypeLabel } from "./command-type-label";

const props = withDefaults(
  defineProps<{
    command?: CommandConfig;
    target: CommandTarget;
    takenNames: string[];
  }>(),
  { command: undefined },
);

const api = useModal<CommandConfig>();
const journalsVM = useService(JournalsViewModel);
const validIcons = new Set(getIconIds());

function journalWriteType(): JournalWrite["type"] {
  if (props.target.kind !== "journal") return "day";
  return journalsVM.getJournal(props.target.journalName).getOrUndefined()?.write.type ?? "day";
}

const writeType = ref<JournalWrite["type"]>(
  props.target.kind === "journal" ? journalWriteType() : props.target.writeType,
);

const initial = props.command ?? commandCollection.defaultItem("");

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: {
    name: initial.name,
    type: initial.type,
    context: initial.context,
    showInRibbon: initial.showInRibbon,
    icon: initial.icon,
    openMode: initial.openMode,
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        name: v.pipe(
          v.string(),
          v.nonEmpty(m.command_name_required_error()),
          v.check((value) => !props.takenNames.includes(value), m.command_name_unique_error()),
        ),
        type: v.picklist([
          "same",
          "next",
          "previous",
          "previous_available",
          "next_available",
          "same_next_week",
          "same_previous_week",
          "same_next_month",
          "same_previous_month",
          "same_next_year",
          "same_previous_year",
        ]),
        context: v.picklist(["today", "open_note", "only_open_note"]),
        showInRibbon: v.boolean(),
        icon: v.string(),
        openMode: v.picklist(["active", "tab", "split", "window"]),
      }),
      v.forward(
        v.partialCheck(
          [["showInRibbon"], ["icon"]],
          (input) => (input.showInRibbon ? validIcons.has(input.icon) : true),
          m.command_icon_required_error(),
        ),
        ["icon"],
      ),
    ),
  ),
});

const [name, nameAttrs] = defineField("name");
const [type, typeAttrs] = defineField("type");
const [context, contextAttrs] = defineField("context");
const [showInRibbon, showInRibbonAttrs] = defineField("showInRibbon");
const [icon, iconAttrs] = defineField("icon");
const [openMode, openModeAttrs] = defineField("openMode");

const typeOptions = computed(() =>
  supportedTypes(writeType.value).map((value) => ({
    value,
    label: commandTypeLabel(writeType.value, value, context.value ?? "today"),
  })),
);

watch(writeType, () => {
  const supported = supportedTypes(writeType.value);
  if (type.value === undefined || !supported.includes(type.value)) {
    type.value = "same";
  }
});

const onSubmit = handleSubmit((values) => {
  const submittedTarget: CommandTarget = match(props.target)
    .with({ kind: "all" }, () => ({
      kind: "all" as const,
      writeType: writeType.value as Exclude<JournalWrite["type"], "custom">,
    }))
    .with({ kind: "journal" }, (t) => ({ kind: "journal" as const, journalName: t.journalName }))
    .with({ kind: "shelf" }, (t) => ({
      kind: "shelf" as const,
      shelfName: t.shelfName,
      writeType: writeType.value as Exclude<JournalWrite["type"], "custom">,
    }))
    .exhaustive();
  api.submit({
    name: values.name,
    icon: values.icon,
    showInRibbon: values.showInRibbon,
    openMode: values.openMode,
    type: values.type,
    context: values.context,
    target: submittedTarget,
  });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.common_label_name()">
      <template #description>
        <span v-if="props.target.kind !== 'all'">{{ m.command_name_prefix_hint({ kind: props.target.kind }) }}</span>
        <span v-for="error of errorBag.name" :key="error" class="command-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="name" v-bind="nameAttrs" />
    </UiSettingRow>

    <UiSettingRow v-if="props.target.kind !== 'journal'" :name="m.command_modal_write_type_label()">
      <UiDropdown v-model="writeType">
        <option value="day">{{ m.command_write_type_option({ writeType: "day" }) }}</option>
        <option value="week">{{ m.command_write_type_option({ writeType: "week" }) }}</option>
        <option value="month">{{ m.command_write_type_option({ writeType: "month" }) }}</option>
        <option value="quarter">{{ m.command_write_type_option({ writeType: "quarter" }) }}</option>
        <option value="year">{{ m.command_write_type_option({ writeType: "year" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.command_modal_type_label()">
      <UiDropdown v-model="type" v-bind="typeAttrs">
        <option v-for="option of typeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow v-if="type !== 'same'" :name="m.command_modal_context_label()">
      <template #description>
        <div>{{ m.command_modal_context_description() }}</div>
        <div v-if="context === 'open_note'">{{ m.command_modal_context_open_note_hint() }}</div>
        <div v-if="context === 'only_open_note'">{{ m.command_modal_context_only_open_note_hint() }}</div>
      </template>
      <UiDropdown v-model="context" v-bind="contextAttrs">
        <option value="today">{{ m.command_context_option({ context: "today" }) }}</option>
        <option value="open_note">{{ m.command_context_option({ context: "open_note" }) }}</option>
        <option value="only_open_note">{{ m.command_context_option({ context: "only_open_note" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.common_show_in_ribbon()">
      <UiToggle v-model="showInRibbon" v-bind="showInRibbonAttrs" :tooltip="m.common_show_in_ribbon()" />
    </UiSettingRow>

    <UiSettingRow v-if="showInRibbon" :name="m.common_label_icon()">
      <template #description>
        <span v-for="error of errorBag.icon" :key="error" class="command-form-error">{{ error }}</span>
      </template>
      <UiIconSuggest v-model="icon" v-bind="iconAttrs" />
    </UiSettingRow>

    <UiSettingRow :name="m.command_modal_open_mode_label()">
      <UiDropdown v-model="openMode" v-bind="openModeAttrs">
        <option value="active">{{ m.command_open_mode_option({ mode: "active" }) }}</option>
        <option value="tab">{{ m.command_open_mode_option({ mode: "tab" }) }}</option>
        <option value="split">{{ m.command_open_mode_option({ mode: "split" }) }}</option>
        <option value="window">{{ m.command_open_mode_option({ mode: "window" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">
        {{ command === undefined ? m.common_action_create() : m.common_action_submit() }}
      </UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.command-form-error {
  color: var(--text-error);
  display: block;
}
</style>
