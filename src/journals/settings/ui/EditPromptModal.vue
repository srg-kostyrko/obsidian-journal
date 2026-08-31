<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useFieldArray, useForm } from "vee-validate";
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { isRequired } from "@/journals/prompts/config";
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

import DateFormatPreview from "./DateFormatPreview.vue";

import type { Prompt } from "../../prompts/config";

const props = withDefaults(defineProps<{ journalName: string; typeId?: string; promptIndex?: number }>(), {
  typeId: undefined,
  promptIndex: undefined,
});
const api = useModal<Prompt>();
const journalsVM = useService(JournalsViewModel);

const config = computed(() => journalsVM.getJournal(props.journalName).getOrUndefined());
const noteletType = computed(() => (props.typeId === undefined ? undefined : config.value?.notelets[props.typeId]));
const owner = computed(() => (props.typeId === undefined ? config.value : noteletType.value));
const prompts = computed(() => owner.value?.prompts ?? []);
const current = computed(() => (props.promptIndex === undefined ? undefined : prompts.value[props.promptIndex]));

const takenVariables = computed(() => [
  ...prompts.value.filter((_, i) => i !== props.promptIndex).map((prompt) => prompt.variable),
  // A notelet's render context carries the journal's numbering digits, so a type question named
  // after one collides exactly as a journal question would.
  ...(config.value?.numbering.sources.map((source) => source.variable) ?? []),
]);

// A type's reserved set is narrower than a journal's: a notelet only ever carries the journal
// claim, the date field, the type key, this type's counter and this type's answers — never the
// journal's numbering or question keys, and never another type's.
const takenKeys = computed(() =>
  [
    ...prompts.value.filter((_, i) => i !== props.promptIndex).map((prompt) => prompt.frontmatterKey),
    ...(noteletType.value === undefined
      ? (config.value?.numbering.sources.map((source) => source.frontmatterKey) ?? [])
      : [noteletType.value.counter.frontmatterKey]),
    ...(config.value ? reservedFrontmatterKeys(config.value) : []),
  ].filter((key) => key !== ""),
);

const PROMPT_TYPES = ["text", "number", "date", "toggle", "select"] as const;
const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
interface FormValues {
  variable: string;
  question: string;
  type: (typeof PROMPT_TYPES)[number];
  format: string;
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
  };
  // A yes/no question has no blank answer to refuse, so it carries no required flag at all —
  // the form still holds one, so that switching type and back does not forget the user's pick.
  if (entered.type === "toggle") return { ...base, type: "toggle" };
  const withRequired = { ...base, required: entered.required };
  if (entered.type === "select") return { ...withRequired, type: "select", options: entered.options };
  if (entered.type === "date") return { ...withRequired, type: "date", format: entered.format };
  return { ...withRequired, type: entered.type };
}

function reachesPath(entered: FormValues): boolean {
  if (!owner.value) return false;
  return (
    promptsInPath({
      nameTemplate: owner.value.nameTemplate,
      folder: owner.value.folder,
      prompts: [candidateFrom(entered)],
    }).length > 0
  );
}

// valibot's own `v.forward` only accepts a fixed path, so a per-row choice error (an
// unknown number of rows) is built the same way `forward` builds its own path items.
function pathTo(
  root: FormValues,
  keys: readonly [string | number, ...(string | number)[]],
): [v.IssuePathItem, ...v.IssuePathItem[]] {
  let input: unknown = root;
  return keys.map((key) => {
    const value = (input as Record<string | number, unknown>)[key];
    const item: v.IssuePathItem = { type: "unknown", origin: "value", input, key, value };
    input = value;
    return item;
  }) as [v.IssuePathItem, ...v.IssuePathItem[]];
}

const { defineField, errorBag, handleSubmit, values } = useForm<FormValues>({
  initialValues: {
    variable: current.value?.variable ?? "",
    question: current.value?.question ?? "",
    type: current.value?.type ?? "text",
    format: current.value?.type === "date" ? current.value.format : DEFAULT_DATE_FORMAT,
    frontmatterKey: current.value?.frontmatterKey ?? "",
    required: current.value !== undefined && isRequired(current.value),
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
        format: v.string(),
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
      v.rawCheck(({ dataset, addIssue }) => {
        const entered = dataset.value as FormValues;
        if (entered.type !== "select") return;
        if (entered.options.length === 0) {
          addIssue({ message: m.journal_prompt_options_required(), path: pathTo(entered, ["options"]) });
          return;
        }
        for (const [index, option] of entered.options.entries()) {
          if (option.label.trim() === "") {
            addIssue({
              message: m.journal_prompt_option_label_required(),
              path: pathTo(entered, ["options", index, "label"]),
            });
          }
          if (option.value.trim() === "") {
            addIssue({
              message: m.journal_prompt_option_value_required(),
              path: pathTo(entered, ["options", index, "value"]),
            });
          }
        }
      }),
    ),
  ),
});

const [variable, variableAttrs] = defineField("variable");
const [question, questionAttrs] = defineField("question");
const [type] = defineField("type");
const [format] = defineField("format");
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

// Only a new question's key auto-fills, and only until the user edits it themselves — an
// existing question's key is never overwritten from a variable rename.
const keyTouched = ref(current.value !== undefined);
function onFrontmatterKeyInput(value: string | undefined): void {
  keyTouched.value = true;
  frontmatterKey.value = value ?? "";
}
watch(variable, (value) => {
  if (keyTouched.value) return;
  frontmatterKey.value = value ? `journal-${value}` : "";
});

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

    <UiSettingRow v-if="values.type === 'date'" :name="m.journal_prompt_date_format_label()">
      <template #description>
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">
          {{ m.common_moment_format_reference() }}
        </a>
        <DateFormatPreview :format="format" />
        <span v-for="error of errorBag.format" :key="error" class="prompt-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="format" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_sequence_variable_label()">
      <template #description>
        <span v-for="error of errorBag.variable" :key="error" class="prompt-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="variable" v-bind="variableAttrs" />
    </UiSettingRow>

    <template v-if="values.type === 'select'">
      <UiSettingRow no-controls>
        <template #description>
          <span v-for="error of errorBag.options" :key="error" class="prompt-form-error">{{ error }}</span>
        </template>
      </UiSettingRow>
      <div v-for="(field, i) of options.fields.value" :key="field.key" class="prompt-option-row">
        <div class="prompt-option-field">
          <UiTextInput v-model="field.value.label" :aria-label="m.journal_prompt_option_label()" />
          <span v-for="error of errorBag[`options[${i}].label`]" :key="error" class="prompt-form-error">{{
            error
          }}</span>
        </div>
        <div class="prompt-option-field">
          <UiTextInput v-model="field.value.value" :aria-label="m.journal_prompt_option_value()" />
          <span v-for="error of errorBag[`options[${i}].value`]" :key="error" class="prompt-form-error">{{
            error
          }}</span>
        </div>
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
      <UiTextInput
        :model-value="frontmatterKey"
        v-bind="frontmatterKeyAttrs"
        @update:model-value="onFrontmatterKeyInput"
      />
    </UiSettingRow>

    <UiSettingRow v-if="values.type !== 'toggle'" :name="m.journal_prompt_required_label()">
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
  align-items: flex-start;
  gap: var(--size-4-2);
  padding-block: var(--size-2-2);
}
.prompt-option-field {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
