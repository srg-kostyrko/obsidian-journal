<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useField, useFieldArray, useForm } from "vee-validate";
import { computed } from "vue";

import {
  decorationSchema,
  defaultCondition,
  type JournalDecoration,
  type JournalDecorationCondition,
} from "@/decorations";
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiButtonDropdown from "@/ui/UiButtonDropdown.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { SINGLETON_CONDITION_TYPES } from "./condition-types";
import ConditionItem from "./ConditionItem.vue";
import DecorationCanvas from "./DecorationCanvas.vue";

const props = defineProps<{
  decoration?: JournalDecoration;
  conditionTypes: readonly JournalDecorationCondition["type"][];
  journalName?: string;
}>();
const api = useModal<{ decoration: JournalDecoration }>();

const initial: JournalDecoration = props.decoration ?? { mode: "and", conditions: [], styles: [] };

const { values, handleSubmit } = useForm<JournalDecoration>({
  initialValues: JSON.parse(JSON.stringify(initial)) as JournalDecoration,
  validationSchema: toTypedSchema(decorationSchema),
});

const conditions = useFieldArray<JournalDecorationCondition>("conditions");
const { value: mode } = useField<JournalDecoration["mode"]>("mode");

const incomplete = computed(() => values.conditions.length === 0 || values.styles.length === 0);

const addConditionOptions = computed<{ value: string; label: string }[]>(() => {
  const allowed = props.conditionTypes;
  const used = new Set(values.conditions.map((c) => c.type));
  return allowed
    .filter((t) => !(used.has(t) && SINGLETON_CONDITION_TYPES.has(t)))
    .map((t) => ({ value: t, label: m.decoration_condition_type_label({ type: t }) }));
});

function addCondition(type: string): void {
  conditions.push(defaultCondition(type as JournalDecorationCondition["type"]));
}

const onSubmit = handleSubmit((decoration) => {
  if (decoration.conditions.length === 0 || decoration.styles.length === 0) return;
  api.submit({ decoration });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div class="edit-decoration-panes">
      <div class="pane-conditions">
        <UiSettingRow :name="m.decoration_modal_mode_label()">
          <UiDropdown v-model="mode">
            <option value="and">{{ m.decoration_modal_mode_option({ kind: "and" }) }}</option>
            <option value="or">{{ m.decoration_modal_mode_option({ kind: "or" }) }}</option>
          </UiDropdown>
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
          <UiSettingRow stacked>
            <template #name>
              <div class="condition-header">
                <span>{{ m.decoration_condition_type_short({ type: condition.type }) }}</span>
                <UiIconButton :icon="icons.action.delete" @click="conditions.remove(i)" />
              </div>
            </template>
            <ConditionItem :name="`conditions.${i}`" :condition="condition" :journal-name="journalName" />
          </UiSettingRow>
        </div>
      </div>
      <div class="pane-canvas">
        <DecorationCanvas name="styles" :styles="values.styles" />
      </div>
    </div>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit" :disabled="incomplete">
        {{ decoration === undefined ? m.common_action_create() : m.common_action_submit() }}
      </UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.edit-decoration-panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--size-4-4);
  align-items: start;
}
/* Grid items default to min-width: auto, which lets a wide condition row push its column past
   half the modal and shove the canvas off-screen. */
.pane-conditions,
.pane-canvas {
  min-width: 0;
}
.pane-canvas {
  border-left: 1px solid var(--background-modifier-border);
  padding-left: var(--size-4-4);
}
@media (max-width: 700px) {
  .edit-decoration-panes {
    grid-template-columns: 1fr;
  }
  .pane-canvas {
    border-left: none;
    border-top: 1px solid var(--background-modifier-border);
    padding-left: 0;
    padding-top: var(--size-4-4);
  }
}
.condition-row {
  position: relative;
}
/* The mode badge straddles the row's top border, so the preceding row needs clearance
   beyond its own bottom padding or the badge lands on that row's last line. */
.condition-row + .condition-row {
  margin-top: var(--size-4-3);
}
.condition-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-4-2);
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
