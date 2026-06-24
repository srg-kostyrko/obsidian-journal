<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useField, useFieldArray, useForm } from "vee-validate";
import { computed, ref } from "vue";

import {
  decorationSchema,
  defaultCondition,
  defaultStyle,
  type JournalDecoration,
  type JournalDecorationCondition,
  type JournalDecorationStyle,
} from "@/decorations";
import DecorationPreview from "@/decorations/ui/DecorationPreview.vue";
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import type { JournalConfig } from "@/journals/config";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiButtonDropdown from "@/ui/UiButtonDropdown.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { conditionTypeOptions } from "./condition-types";
import ConditionItem from "./ConditionItem.vue";
import StyleItem from "./StyleItem.vue";

const props = defineProps<{
  journalName: string;
  decoration?: JournalDecoration;
  writeType: JournalConfig["write"]["type"];
}>();
const api = useModal<{ decoration: JournalDecoration }>();

const initial: JournalDecoration = props.decoration ?? { mode: "and", conditions: [], styles: [] };

const { values, handleSubmit } = useForm<JournalDecoration>({
  initialValues: JSON.parse(JSON.stringify(initial)) as JournalDecoration,
  validationSchema: toTypedSchema(decorationSchema),
});

const conditions = useFieldArray<JournalDecorationCondition>("conditions");
const styles = useFieldArray<JournalDecorationStyle>("styles");
const { value: mode } = useField<JournalDecoration["mode"]>("mode");

const formError = ref<string | null>(null);

const addConditionOptions = computed<{ value: string; label: string }[]>(() => {
  const allowed = conditionTypeOptions[props.writeType];
  const used = new Set(values.conditions.map((c) => c.type));
  return allowed
    .filter((t) => !used.has(t))
    .map((t) => ({ value: t, label: m.decoration_condition_type_label({ type: t }) }));
});

const addStyleOptions = computed<{ value: string; label: string }[]>(() => {
  const all = ["background", "color", "shape", "corner", "icon", "border"] as const;
  const used = new Set(values.styles.map((s) => s.type));
  return all.filter((t) => !used.has(t)).map((t) => ({ value: t, label: m.decoration_style_type_label({ type: t }) }));
});

const previewDay = new Date().getDate();

function addCondition(type: string): void {
  conditions.push(defaultCondition(type as JournalDecorationCondition["type"]));
}
function addStyle(type: string): void {
  styles.push(defaultStyle(type as JournalDecorationStyle["type"]));
}

const onSubmit = handleSubmit((decoration) => {
  if (decoration.conditions.length === 0) {
    formError.value = m.decoration_no_conditions_error();
    return;
  }
  if (decoration.styles.length === 0) {
    formError.value = m.decoration_no_styles_error();
    return;
  }
  formError.value = null;
  api.submit({ decoration });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow>
      <template #description>
        <span v-if="formError" class="form-error">{{ formError }}</span>
      </template>
      <span>{{ m.decoration_modal_mode_prefix() }}</span>
      <UiDropdown v-model="mode">
        <option value="and">{{ m.decoration_modal_mode_option({ kind: "and" }) }}</option>
        <option value="or">{{ m.decoration_modal_mode_option({ kind: "or" }) }}</option>
      </UiDropdown>
      <span>{{ m.decoration_modal_mode_suffix() }}</span>
    </UiSettingRow>

    <UiSettingRow>
      <UiButtonDropdown :options="addConditionOptions" @select="addCondition">
        {{ m.decoration_modal_add_condition() }}
      </UiButtonDropdown>
    </UiSettingRow>
    <UiSettingRow v-if="values.conditions.length === 0" no-controls>
      <template #description>{{ m.decoration_modal_no_conditions() }}</template>
    </UiSettingRow>
    <div v-for="(condition, i) of values.conditions" :key="i" class="condition-row">
      <span v-if="i > 0" class="mode-hint">{{ m.decoration_describe_mode({ kind: mode }) }}</span>
      <UiSettingRow :name="m.decoration_condition_type_short({ type: condition.type })">
        <ConditionItem :name="`conditions.${i}`" :condition="condition" />
        <UiIconButton :icon="icons.action.delete" @click="conditions.remove(i)" />
      </UiSettingRow>
    </div>

    <hr />

    <div class="preview-grid">
      <div class="preview">
        <DecorationPreview :styles="values.styles">{{ previewDay }}</DecorationPreview>
      </div>
      <div>
        <UiSettingRow>
          <UiButtonDropdown :options="addStyleOptions" @select="addStyle">
            {{ m.decoration_modal_add_style() }}
          </UiButtonDropdown>
        </UiSettingRow>
        <UiSettingRow v-if="values.styles.length === 0" no-controls>
          <template #description>{{ m.decoration_modal_no_styles() }}</template>
        </UiSettingRow>
        <template v-for="(style, i) of values.styles" :key="i">
          <UiSettingRow heading>
            <template #name>{{ m.decoration_style_header({ type: style.type }) }}</template>
            <UiIconButton :icon="icons.action.delete" @click="styles.remove(i)" />
          </UiSettingRow>
          <StyleItem :name="`styles.${i}`" :style="style" />
        </template>
      </div>
    </div>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.preview-grid {
  display: grid;
  grid-template-columns: 25% 1fr;
  gap: var(--size-4-2);
}
.preview {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--size-4-2);
}
.form-error {
  color: var(--text-error);
  display: block;
}
.condition-row {
  position: relative;
}
.mode-hint {
  position: absolute;
  top: 0;
  left: 30px;
  z-index: 1;
  transform: translateY(-50%);
  padding: var(--size-2-1) var(--size-2-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-s);
  background-color: var(--background-primary);
  text-transform: uppercase;
  font-size: 75%;
  line-height: 1;
}
</style>
