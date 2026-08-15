<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { NUMBERING_VARIABLE_RE, RESERVED_VARIABLE_NAMES } from "@/journals/numbering-variables";
import { JournalsViewModel } from "@/journals/view-model";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import type { NumberingDigitDraft } from "./modals";

const props = withDefaults(defineProps<{ journalName: string; sourceIndex?: number }>(), { sourceIndex: undefined });
const api = useModal<NumberingDigitDraft>();
const journalsVM = useService(JournalsViewModel);

const sources = computed(() => journalsVM.getJournal(props.journalName).getOrUndefined()?.numbering.sources ?? []);
const current = computed(() => (props.sourceIndex === undefined ? undefined : sources.value[props.sourceIndex]));
// A new digit is appended, so it is the top digit only when the list is empty.
const isTopDigit = computed(() =>
  props.sourceIndex === undefined ? sources.value.length === 0 : props.sourceIndex === 0,
);
const parentVariable = computed(() => {
  const index = props.sourceIndex ?? sources.value.length;
  return sources.value[index - 1]?.variable ?? "";
});
const takenVariables = computed(() =>
  sources.value.filter((_, i) => i !== props.sourceIndex).map((source) => source.variable),
);
const takenKeys = computed(() =>
  sources.value.filter((_, i) => i !== props.sourceIndex).map((source) => source.frontmatterKey),
);

// isTopDigit gates only which control renders — a non-top digit's resetKind field can still
// carry a stale "never" from a value the schema deliberately does not police (a hand-edited
// config, or sources changing reactively while the modal is open). Both the count-required
// validation and the submitted reset must agree on the same test, or a corrupted non-top
// digit can pass validation while submitting a count-less reset.
function willReset(resetKind: "after" | "never"): boolean {
  return !(isTopDigit.value && resetKind === "never");
}

const { defineField, errorBag, handleSubmit, values } = useForm({
  initialValues: {
    variable: current.value?.variable ?? "",
    frontmatterKey: current.value?.frontmatterKey ?? "",
    anchorValue: current.value?.anchorValue ?? 1,
    resetKind: current.value?.reset.kind ?? (isTopDigit.value ? "never" : "after"),
    resetCount: current.value?.reset.kind === "after" ? current.value.reset.count : 2,
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        variable: v.pipe(
          v.string(),
          v.nonEmpty(m.journal_sequence_variable_required()),
          v.regex(NUMBERING_VARIABLE_RE, m.journal_sequence_variable_invalid()),
          v.check(
            (value) => !RESERVED_VARIABLE_NAMES.includes(value),
            (issue) => m.journal_sequence_variable_reserved({ name: issue.input }),
          ),
          v.check(
            (value) => !takenVariables.value.includes(value),
            (issue) => m.journal_sequence_variable_duplicate({ name: issue.input }),
          ),
        ),
        frontmatterKey: v.pipe(
          v.string(),
          v.nonEmpty(m.journal_property_name_required()),
          v.check(
            (value) => !takenKeys.value.includes(value),
            (issue) => m.journal_sequence_property_duplicate({ name: issue.input }),
          ),
        ),
        anchorValue: v.pipe(v.number(), v.integer()),
        resetKind: v.picklist(["never", "after"]),
        resetCount: v.pipe(v.number(), v.integer()),
      }),
      v.forward(
        v.check((entered) => !willReset(entered.resetKind) || entered.resetCount >= 2, m.journal_sequence_count_min()),
        ["resetCount"],
      ),
    ),
  ),
});

const [variable, variableAttrs] = defineField("variable");
const [frontmatterKey, frontmatterKeyAttrs] = defineField("frontmatterKey");
const [anchorValue] = defineField("anchorValue");
const [resetKind] = defineField("resetKind");
const [resetCount] = defineField("resetCount");

// Only a new digit's key auto-fills, and only until the user edits it themselves — an
// existing digit's key is never overwritten from a variable rename.
const keyTouched = ref(current.value !== undefined);
function onFrontmatterKeyInput(value: string | undefined): void {
  keyTouched.value = true;
  frontmatterKey.value = value ?? "";
}
watch(variable, (value) => {
  if (keyTouched.value) return;
  frontmatterKey.value = value ? `journal-${value}` : "";
});

const onSubmit = handleSubmit((entered) =>
  api.submit({
    variable: entered.variable,
    frontmatterKey: entered.frontmatterKey,
    anchorValue: entered.anchorValue,
    reset: willReset(entered.resetKind) ? { kind: "after", count: entered.resetCount } : { kind: "never" },
  }),
);
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_sequence_variable_label()">
      <template #description>
        {{ m.journal_sequence_variable_description() }}
        <span v-for="error of errorBag.variable" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="variable" v-bind="variableAttrs" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_edit_start_number_label()">
      <template #description>{{ m.journal_edit_start_number_description() }}</template>
      <UiNumberInput v-model="anchorValue" />
    </UiSettingRow>

    <UiSettingRow v-if="isTopDigit" :name="m.journal_edit_reset_label()">
      <template #description>
        {{ m.journal_edit_reset_description() }}
        <span v-for="error of errorBag.resetCount" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiDropdown v-model="resetKind">
        <option value="never">{{ m.journal_edit_reset_option({ kind: "never" }) }}</option>
        <option value="after">{{ m.journal_edit_reset_option({ kind: "after" }) }}</option>
      </UiDropdown>
      <template v-if="values.resetKind === 'after'">
        <UiNumberInput v-model="resetCount" :min="2" />
        <span>{{ m.journal_edit_reset_count_suffix() }}</span>
      </template>
    </UiSettingRow>

    <UiSettingRow v-else :name="m.journal_sequence_per_parent_label({ parent: parentVariable })">
      <template #description>
        {{ m.journal_sequence_per_parent_description({ name: values.variable ?? "", parent: parentVariable }) }}
        <span v-for="error of errorBag.resetCount" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiNumberInput v-model="resetCount" :min="2" />
    </UiSettingRow>

    <UiSettingRow :name="m.common_label_property_name()">
      <template #description>
        <span v-for="error of errorBag.frontmatterKey" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput
        :model-value="frontmatterKey"
        v-bind="frontmatterKeyAttrs"
        @update:model-value="onFrontmatterKeyInput"
      />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
