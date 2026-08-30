<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { match } from "ts-pattern";
import * as v from "valibot";
import { useForm, type BaseFieldProps, type TypedSchema } from "vee-validate";
import { computed, type Ref } from "vue";

import { CalendarDate, periodOfKind, type AnchorString, type Period } from "@/calendar";
import { DatePicker } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { NoteletPathService } from "@/journals/notelets/notelet-path";
import { NotePathService } from "@/journals/notes/note-path";
import { JournalsViewModel } from "@/journals/view-model";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { isRequired } from "../config";
import { isPlaceholder } from "../placeholder";
import { promptsInPath } from "../prompts-in-path";

import type { Prompt, PromptAnswer, PromptOption } from "../config";
import type { PromptAnswersModalProps } from "./modals";

const props = defineProps<PromptAnswersModalProps>();
const api = useModal<Record<string, PromptAnswer>>();
const journalsVM = useService(JournalsViewModel);
const paths = useService(NotePathService);
const noteletPaths = useService(NoteletPathService);

const config = computed(() => journalsVM.getJournal(props.metadata.journalName).getOrUndefined());
const noteletType = computed(() =>
  "kind" in props.metadata ? config.value?.notelets[props.metadata.typeId] : undefined,
);
// The journal a creation prompt belongs to does not change while this modal is open, so the
// prompt list is read once here rather than kept reactive — only the answers need to be.
//
// The prompts asked belong to whatever owns this note: a notelet asks its type's questions, and
// the journal's — authored for the period note — are neither inherited nor asked.
const owner = computed(() => ("kind" in props.metadata ? noteletType.value : config.value));
const prompts = owner.value?.prompts ?? [];

const inPath = computed(() => (owner.value ? promptsInPath(owner.value) : []));
const inPathVariables = new Set(inPath.value.map((prompt) => prompt.variable));
const showPath = computed(() => inPath.value.length > 0 || props.confirming);
const isLive = computed(() => inPath.value.length > 0);

// Two independent reasons an answer cannot be left blank, and the form owes the user the one
// that applies: a prompt the path spells would otherwise write the placeholder into the file
// name, and a prompt the journal marks required is required wherever its answer lands.
function requirementOf(prompt: Prompt): { required: boolean; message: () => string } {
  if (inPathVariables.has(prompt.variable)) {
    return { required: true, message: m.journal_prompt_answer_required_in_path };
  }
  return { required: isRequired(prompt), message: m.journal_prompt_answer_required };
}

function mustAnswer(prompt: Prompt): boolean {
  return requirementOf(prompt).required;
}

// A number opens blank rather than at 0, so an untouched one is unanswered like every other
// blank field — a 0 nobody typed would otherwise be stored and written to the note's property.
function initialValueFor(prompt: Prompt): PromptAnswer | undefined {
  if (prompt.type === "number") return undefined;
  return (
    match(prompt)
      .with({ type: "toggle" }, () => false)
      // An optional choice opens on no choice, so leaving it alone means "not answered"; a
      // required one opens on its first option, which is already a valid answer.
      .with({ type: "select" }, (select) => (mustAnswer(select) ? (select.options.at(0)?.value ?? "") : ""))
      .otherwise(() => "")
  );
}

function schemaFor(prompt: Prompt): v.GenericSchema<unknown, PromptAnswer | undefined> {
  // A toggle always holds one of its two values, so it has no blank state to refuse.
  if (prompt.type === "toggle") return v.boolean();
  const { required, message } = requirementOf(prompt);
  // An unanswered number is undefined, never 0 — the required check is what refuses it, and a
  // typed 0 is an answer like any other.
  if (prompt.type === "number") return required ? v.number(message()) : v.optional(v.number());
  if (prompt.type === "text") {
    const reserved = v.check(
      (value: string) => !isPlaceholder(value),
      (issue) => m.journal_prompt_answer_reserved({ name: issue.input }),
    );
    return required ? v.pipe(v.string(), v.minLength(1, message()), reserved) : v.pipe(v.string(), reserved);
  }
  // date and select answers are never typed freely, so the placeholder-reservation check that
  // guards free text does not apply to them.
  return required ? v.pipe(v.string(), v.minLength(1, message())) : v.string();
}

const initialValues: Record<string, PromptAnswer | undefined> = {};
const schemaShape: Record<string, v.GenericSchema<unknown, PromptAnswer | undefined>> = {};
for (const prompt of prompts) {
  initialValues[prompt.variable] = initialValueFor(prompt);
  schemaShape[prompt.variable] = schemaFor(prompt);
}

// v.object's inferred output collapses to `Record<string, unknown>` for an entries record built
// from a runtime loop rather than a literal — valibot's typed-key mapping has nothing to map
// over when the object's key set is not known statically. Each entry's own schema is still the
// correctly typed one built above, so the object's real runtime output is Record<string,
// PromptAnswer | undefined>; only the static inference falls short, hence the cast here.
const validationSchema: TypedSchema<
  Record<string, PromptAnswer | undefined>,
  Record<string, PromptAnswer | undefined>
> = toTypedSchema(v.object(schemaShape));

const { defineField, errorBag, handleSubmit, values } = useForm({ initialValues, validationSchema });

interface PromptField {
  readonly prompt: Prompt;
  // Path<Record<string, PromptAnswer>> can't resolve a literal key from a runtime loop either,
  // so defineField falls back to Ref<unknown> — cast for the same reason as the schema above.
  readonly value: Ref<PromptAnswer | undefined>;
  readonly attrs: Ref<BaseFieldProps>;
}

const fields: PromptField[] = prompts.map((prompt) => {
  const [value, attrs] = defineField(prompt.variable) as [Ref<PromptAnswer | undefined>, Ref<BaseFieldProps>];
  return { prompt, value, attrs };
});

function selectOptionsOf(prompt: Prompt): readonly PromptOption[] {
  return prompt.type === "select" ? prompt.options : [];
}

function asText(value: PromptAnswer | undefined): string {
  return typeof value === "string" ? value : "";
}

// A cleared number input reports the empty string rather than undefined, so the blank state is
// read back as "anything that is not a number", never as a falsy check that would swallow 0.
function asNumber(value: PromptAnswer | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asBoolean(value: PromptAnswer | undefined): boolean {
  return typeof value === "boolean" ? value : false;
}

function asDate(value: PromptAnswer | undefined): Period | null {
  if (typeof value !== "string" || value === "") return null;
  return periodOfKind("day", CalendarDate.fromAnchor(value as AnchorString));
}

function setDate(field: PromptField, period: Period | null | undefined): void {
  field.value.value = period ? period.anchor.toAnchor() : "";
}

// A blank answer leaves its variable out rather than carrying undefined through: every
// consumer downstream — the note name, the body, the frontmatter — already reads a missing
// key as unanswered, and an undefined value would be written as an empty property instead.
function given(entered: Record<string, PromptAnswer | undefined>): Record<string, PromptAnswer> {
  const answers: Record<string, PromptAnswer> = {};
  for (const [variable, answer] of Object.entries(entered)) {
    if (answer !== undefined) answers[variable] = answer;
  }
  return answers;
}

// The whole path, not just the name: a prompt can reach the folder template too, and an
// answer that moves the note into a different folder is exactly what the user is confirming.
//
// A live preview only earns its place when an answer can move it. When it cannot, the path is
// still shown if this modal is standing in for the creation confirmation — the path is that
// confirmation's entire content, so suppressing it would delete what the setting is for.
const previewPath = computed(() => {
  if (config.value === undefined) return "";
  const answers = isLive.value ? given(values) : {};
  if ("kind" in props.metadata) {
    const type = noteletType.value;
    if (type === undefined) return "";
    const path = noteletPaths.availablePathFor(config.value, type, { ...props.metadata, answers });
    return path.isOk() ? path.value : "";
  }
  const path = paths.pathFor(props.metadata.journalName, { ...props.metadata, answers });
  return path.isOk() ? path.value : "";
});

const onSubmit = handleSubmit((entered) => api.submit(given(entered)));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_prompt_period_label()">
      <span>{{ periodLabel }}</span>
    </UiSettingRow>

    <UiSettingRow v-if="showPath" :name="m.journal_prompt_note_path_label()">
      <span>{{ previewPath }}</span>
    </UiSettingRow>

    <UiSettingRow v-for="field in fields" :key="field.prompt.variable" :name="field.prompt.question">
      <template #description>
        <span v-for="error of errorBag[field.prompt.variable]" :key="error" class="prompt-form-error">{{ error }}</span>
      </template>
      <UiTextInput
        v-if="field.prompt.type === 'text'"
        :model-value="asText(field.value.value)"
        v-bind="field.attrs"
        @update:model-value="(value) => (field.value.value = value ?? '')"
      />
      <UiNumberInput
        v-else-if="field.prompt.type === 'number'"
        :model-value="asNumber(field.value.value)"
        v-bind="field.attrs"
        @update:model-value="(value) => (field.value.value = typeof value === 'number' ? value : undefined)"
      />
      <DatePicker
        v-else-if="field.prompt.type === 'date'"
        picking="day"
        :model-value="asDate(field.value.value)"
        @update:model-value="(period) => setDate(field, period)"
      />
      <UiToggle
        v-else-if="field.prompt.type === 'toggle'"
        :model-value="asBoolean(field.value.value)"
        @update:model-value="(value) => (field.value.value = value ?? false)"
      />
      <UiDropdown
        v-else
        :model-value="asText(field.value.value)"
        v-bind="field.attrs"
        @update:model-value="(value) => (field.value.value = value ?? '')"
      >
        <option v-if="!mustAnswer(field.prompt)" value="">{{ m.journal_prompt_select_none() }}</option>
        <option v-for="option in selectOptionsOf(field.prompt)" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.journal_prompt_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.prompt-form-error {
  color: var(--text-error);
  display: block;
}
</style>
