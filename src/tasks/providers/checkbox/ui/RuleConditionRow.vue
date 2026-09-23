<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { conditionValues } from "../condition-text";

import type { CheckboxCondition } from "../rule-schema";

const condition = defineModel<CheckboxCondition>({ required: true });

// Switching the type has to replace the whole object, not just the `type` field: `tags` and
// `headings` do not coexist on the discriminated union, so leaving the old type's field behind
// would produce a value the schema itself could not have parsed.
function setType(type: CheckboxCondition["type"]): void {
  condition.value =
    type === "tag"
      ? { type: "tag", condition: "has", tags: [] }
      : { type: "heading", condition: "under", headings: [] };
}

const valuesText = computed<string>({
  get: () => (condition.value.type === "tag" ? condition.value.tags : condition.value.headings).join(", "),
  // Coerced on the way in, so the store always holds metadataCache's spelling. The input then
  // shows the coerced text back, which for the usual case — typing a name left to right — just
  // means the "#" appears as you go; editing mid-string is the case it reads oddly in.
  set: (text) => {
    const list = conditionValues(text, condition.value.type);
    if (condition.value.type === "tag") condition.value.tags = list;
    else condition.value.headings = list;
  },
});
</script>

<template>
  <UiDropdown :model-value="condition.type" @update:model-value="setType($event as CheckboxCondition['type'])">
    <option value="tag">{{ m.tasks_settings_condition_tag() }}</option>
    <option value="heading">{{ m.tasks_settings_condition_heading() }}</option>
  </UiDropdown>
  <UiDropdown v-if="condition.type === 'tag'" v-model="condition.condition">
    <option value="has">{{ m.tasks_settings_condition_has() }}</option>
    <option value="lacks">{{ m.tasks_settings_condition_lacks() }}</option>
  </UiDropdown>
  <UiDropdown v-else v-model="condition.condition">
    <option value="under">{{ m.tasks_settings_condition_under() }}</option>
    <option value="not-under">{{ m.tasks_settings_condition_not_under() }}</option>
  </UiDropdown>
  <UiTextInput
    v-model="valuesText"
    :aria-label="condition.type === 'tag' ? m.tasks_settings_condition_tag() : m.tasks_settings_condition_heading()"
  />
</template>
