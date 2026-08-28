<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useFieldArray, useForm } from "vee-validate";
import { computed, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { promptsInPath } from "@/journals/prompts/prompts-in-path";
import { isReservedVariable, TEMPLATE_VARIABLE_RE } from "@/journals/reserved-variables";
import { JournalsViewModel } from "@/journals/view-model";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { reservedFrontmatterKeys } from "../../config";

import type { Prompt } from "../../prompts/config";

const props = withDefaults(defineProps<{ journalName: string; promptIndex?: number }>(), { promptIndex: undefined });
const api = useModal<Prompt>();
const journalsVM = useService(JournalsViewModel);

const config = computed(() => journalsVM.getJournal(props.journalName).getOrUndefined());
const prompts = computed(() => config.value?.prompts ?? []);
const current = computed(() => (props.promptIndex === undefined ? undefined : prompts.value[props.promptIndex]));

const takenVariables = computed(() => [
  ...prompts.value.filter((_, i) => i !== props.promptIndex).map((prompt) => prompt.variable),
  ...(config.value?.numbering.sources.map((source) => source.variable) ?? []),
]);
const takenKeys = computed(() =>
  [
    ...prompts.value.filter((_, i) => i !== props.promptIndex).map((prompt) => prompt.frontmatterKey),
    ...(config.value?.numbering.sources.map((source) => source.frontmatterKey) ?? []),
    ...(config.value ? reservedFrontmatterKeys(config.value) : []),
  ].filter((key) => key !== ""),
);

const PROMPT_TYPES = ["text", "number", "date", "toggle", "select"] as const;
interface FormValues {
  variable: string;
  question: string;
  type: (typeof PROMPT_TYPES)[number];
  frontmatterKey: string;
  required: boolean;
  options: { label: string; value: string }[];
}

// Builds the exact Prompt the form would submit right now, so path-reaching and autoCreate
// checks run against the real candidate rather than a re-derived approximation of it.
function candidateFrom(entered: FormValues): Prompt {
  const base = {
    variable: entered.variable,
    question: entered.question,
    frontmatterKey: entered.frontmatterKey,
    required: entered.required,
  };
  if (entered.type === "select") return { ...base, type: "select", options: entered.options };
  return { ...base, type: entered.type };
}

function reachesPath(entered: FormValues): boolean {
  if (!config.value) return false;
  return (
    promptsInPath({
      nameTemplate: config.value.nameTemplate,
      folder: config.value.folder,
      prompts: [candidateFrom(entered)],
    }).length > 0
  );
}

const { defineField, errorBag, handleSubmit, values } = useForm<FormValues>({
  initialValues: {
    variable: current.value?.variable ?? "",
    question: current.value?.question ?? "",
    type: current.value?.type ?? "text",
    frontmatterKey: current.value?.frontmatterKey ?? "",
    required: current.value?.required ?? false,
    options: current.value?.type === "select" ? current.value.options.map((option) => ({ ...option })) : [],
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        variable: v.pipe(
          v.string(),
          v.nonEmpty(m.journal_sequence_variable_required()),
          v.regex(TEMPLATE_VARIABLE_RE, m.journal_sequence_variable_invalid()),
          v.check(
            (value) => !isReservedVariable(value),
            (issue) => m.journal_sequence_variable_reserved({ name: issue.input }),
          ),
          v.check(
            (value) => takenVariables.value.every((taken) => taken.toLowerCase() !== value.toLowerCase()),
            (issue) => m.journal_prompt_variable_duplicate({ name: issue.input }),
          ),
        ),
        question: v.pipe(v.string(), v.nonEmpty(m.journal_prompt_question_required())),
        type: v.picklist(PROMPT_TYPES),
        frontmatterKey: v.pipe(
          v.optional(v.string(), ""),
          v.check(
            (value) => value === "" || !takenKeys.value.includes(value),
            (issue) => m.journal_prompt_property_duplicate({ name: issue.input }),
          ),
        ),
        required: v.boolean(),
        options: v.array(v.object({ label: v.string(), value: v.string() })),
      }),
      v.forward(
        v.check(
          (entered) => !reachesPath(entered) || entered.frontmatterKey !== "",
          m.journal_prompt_key_required_in_path(),
        ),
        ["frontmatterKey"],
      ),
      v.forward(
        v.check(
          (entered) => !(entered.type === "toggle" && reachesPath(entered)),
          m.journal_prompt_toggle_not_in_path(),
        ),
        ["type"],
      ),
      v.forward(
        v.check(
          (entered) => !(reachesPath(entered) && (config.value?.autoCreate ?? false)),
          m.journal_prompt_autocreate_conflict(),
        ),
        ["variable"],
      ),
      v.forward(
        v.check(
          (entered) =>
            entered.type !== "select" ||
            (entered.options.length > 0 &&
              entered.options.every((option) => option.label.trim() !== "" && option.value.trim() !== "")),
          m.journal_prompt_options_required(),
        ),
        ["options"],
      ),
    ),
  ),
});

const [variable, variableAttrs] = defineField("variable");
const [question, questionAttrs] = defineField("question");
const [type] = defineField("type");
const [frontmatterKey, frontmatterKeyAttrs] = defineField("frontmatterKey");
const [required] = defineField("required");

const options = useFieldArray<{ label: string; value: string }>("options");

// A prompt switching away from select carries no options; switching into it starts from an
// empty list rather than resurrecting whatever was entered before the switch.
watch(type, (now, was) => {
  if (now === "select" && was !== "select" && options.fields.value.length === 0) {
    options.push({ label: "", value: "" });
  }
});

function addOption(): void {
  options.push({ label: "", value: "" });
}

const onSubmit = handleSubmit((entered) => api.submit(candidateFrom(entered)));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_prompt_question_label()">
      <template #description>
        <span v-for="error of errorBag.question" :key="error" class="prompt-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="question" v-bind="questionAttrs" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_sequence_variable_label()">
      <template #description>
        <span v-for="error of errorBag.variable" :key="error" class="prompt-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="variable" v-bind="variableAttrs" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_prompt_type_label()">
      <template #description>
        <span v-for="error of errorBag.type" :key="error" class="prompt-form-error">{{ error }}</span>
      </template>
      <UiDropdown v-model="type">
        <option v-for="promptType of PROMPT_TYPES" :key="promptType" :value="promptType">
          {{ m.journal_prompt_type_option({ type: promptType }) }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <template v-if="values.type === 'select'">
      <UiSettingRow no-controls>
        <template #description>
          <span v-for="error of errorBag.options" :key="error" class="prompt-form-error">{{ error }}</span>
        </template>
      </UiSettingRow>
      <div v-for="(field, i) of options.fields.value" :key="field.key" class="prompt-option-row">
        <UiTextInput v-model="field.value.label" :aria-label="m.journal_prompt_option_label()" />
        <UiTextInput v-model="field.value.value" :aria-label="m.journal_prompt_option_value()" />
        <UiIconButton
          :icon="icons.action.delete"
          :tooltip="m.journal_prompt_option_delete()"
          @click="options.remove(i)"
        />
      </div>
      <UiSettingRow controls-only>
        <UiButton @click="addOption">{{ m.journal_prompt_option_add() }}</UiButton>
      </UiSettingRow>
    </template>

    <UiSettingRow :name="m.common_label_property_name()">
      <template #description>
        <span v-for="error of errorBag.frontmatterKey" :key="error" class="prompt-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="frontmatterKey" v-bind="frontmatterKeyAttrs" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_prompt_required_label()">
      <UiToggle v-model="required" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.prompt-form-error {
  color: var(--text-error);
  display: block;
}
.prompt-option-row {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  padding-block: var(--size-2-2);
}
</style>
