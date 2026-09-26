<script setup lang="ts">
import { ref, watch } from "vue";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import { conditionValues } from "../providers/checkbox/condition-text";

import { defaultTaskCondition } from "./rule-condition-defaults";
import { STATUS_FILTER_OPTIONS, statusFilterLabel } from "./status-filter-options";

import type { TaskCondition } from "../conditions";

const condition = defineModel<TaskCondition>({ required: true });

// Which arms this row's type dropdown offers — the checkbox identification editor passes
// `["tag", "heading"]` (identification never reads a status condition, see rule-schema.ts), the
// listing filter's editor passes all three. Restricting the dropdown is what keeps the checkbox
// editor from ever writing a status condition — there is no other gate.
const { types } = defineProps<{ types: readonly TaskCondition["type"][] }>();

// Multi-root components get no automatic attribute fallthrough, so a parent-side `@blur` on
// <RuleConditionRow> reaches nothing without this — RuleEditor uses it to decide when this row
// has been interacted with, so its "enter a value" error can stay quiet until then.
const emit = defineEmits<{ blur: [] }>();

// Switching the type has to replace the whole object, not just the `type` field: `tags`,
// `headings` and `statuses` do not coexist on the discriminated union, so leaving the old type's
// field behind would produce a value the schema itself could not have parsed.
function setType(type: TaskCondition["type"]): void {
  condition.value = defaultTaskCondition(type);
}

// "" for status: its value editor is the toggle group below, never this row's text input.
function displayText(value: TaskCondition): string {
  if (value.type === "status") return "";
  return (value.type === "tag" ? value.tags : value.headings).join(", ");
}

// A plain ref, not a computed over `condition`: committing on every keystroke ran
// conditionValues() — which drops empty entries — before the user had finished typing the next
// value, so a "," just typed was indistinguishable from a stray one and got erased as it was
// typed (a backspace that emptied one entry down to a bare "#" took the separator before it
// with it, for the same reason). This ref holds exactly what the user has typed; commit() below
// is the only place conditionValues() still runs, at a commit boundary rather than per keystroke.
const valuesText = ref(displayText(condition.value));

// Re-syncs from the model on any external write — switching the condition type above replaces
// the whole object and must clear the input, and a sync merge landing while this row is mounted
// is the same shape.
watch(
  () => condition.value,
  (value) => {
    valuesText.value = displayText(value);
  },
);

function commit(): void {
  if (condition.value.type === "status") return;
  const list = conditionValues(valuesText.value, condition.value.type);
  if (condition.value.type === "tag") condition.value.tags = list;
  else condition.value.headings = list;
  // Shows the coerced form back once committed: a tag gains its "#", a heading loses its "#"
  // markers.
  valuesText.value = displayText(condition.value);
}

// The boundary is the field losing focus, not the window: a window losing OS focus blurs its
// focused element too (Chrome fires change and then blur on it), and committing there re-coerces
// text the user is part-way through typing while they are looking at something else — "#work, #"
// comes back as "#work", caret still in the field. The field keeps DOM focus across a window
// blur and loses it on a real one, so activeElement is what tells the two apart. Read off the
// field's own document rather than the global one, since a popout window has its own. The row's
// own blur goes with it: a window blur is not the user leaving the row either, so it must not
// mark the row touched and surface its "enter a value" error over text still being typed.
function onBlur(event: FocusEvent): void {
  const field = event.target as Element | null;
  if (field !== null && field.ownerDocument.activeElement === field) return;
  commit();
  emit("blur");
}

// A status condition has no text field to blur, so its own value editor marks the row touched
// directly, the moment the user has picked anything at all — same "leave the error quiet until
// interacted with" contract as the text rows above.
function setStatuses(value: string[]): void {
  if (condition.value.type !== "status") return;
  condition.value.statuses = value;
  emit("blur");
}

const statusOptions: { value: string; label: string }[] = STATUS_FILTER_OPTIONS.map((status) => ({
  value: status,
  label: statusFilterLabel(status),
}));
</script>

<template>
  <UiDropdown :model-value="condition.type" @update:model-value="setType($event as TaskCondition['type'])">
    <option v-if="types.includes('tag')" value="tag">{{ m.tasks_settings_condition_tag() }}</option>
    <option v-if="types.includes('heading')" value="heading">{{ m.tasks_settings_condition_heading() }}</option>
    <option v-if="types.includes('status')" value="status">{{ m.tasks_settings_condition_status() }}</option>
  </UiDropdown>
  <UiDropdown v-if="condition.type === 'tag'" v-model="condition.condition">
    <option value="has">{{ m.tasks_settings_condition_has() }}</option>
    <option value="lacks">{{ m.tasks_settings_condition_lacks() }}</option>
  </UiDropdown>
  <UiDropdown v-else-if="condition.type === 'heading'" v-model="condition.condition">
    <option value="under">{{ m.tasks_settings_condition_under() }}</option>
    <option value="not-under">{{ m.tasks_settings_condition_not_under() }}</option>
  </UiDropdown>
  <UiDropdown v-else v-model="condition.condition">
    <option value="is">{{ m.tasks_settings_condition_is() }}</option>
    <option value="is-not">{{ m.tasks_settings_condition_is_not() }}</option>
  </UiDropdown>
  <UiTextInput
    v-if="condition.type !== 'status'"
    v-model="valuesText"
    :aria-label="condition.type === 'tag' ? m.tasks_settings_condition_tag() : m.tasks_settings_condition_heading()"
    @keydown.enter="commit"
    @blur="onBlur"
  />
  <UiToggleGroup v-else :model-value="condition.statuses" :options="statusOptions" @update:model-value="setStatuses" />
</template>
