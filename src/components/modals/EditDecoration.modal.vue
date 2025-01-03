<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  JournalDecoration,
  JournalDecorationCondition,
  JournalDecorationsStyle,
  JournalSettings,
} from "@/types/settings.types";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import CalendarDecoration from "../notes-calendar/decorations/CalendarDecoration.vue";
import DecorationBackground from "./edit-decoration/DecorationBackground.vue";
import DecorationColor from "./edit-decoration/DecorationColor.vue";
import DecorationShape from "./edit-decoration/DecorationShape.vue";
import DecorationCorner from "./edit-decoration/DecorationCorner.vue";
import DecorationIcon from "./edit-decoration/DecorationIcon.vue";
import ButtonDropdown from "../ButtonDropdown.vue";
import ConditionTypeOnly from "./edit-decoration/ConditionTypeOnly.vue";
import ConditionNoteName from "../conditions/ConditionNoteName.vue";
import ConditionProperty from "../conditions/ConditionProperty.vue";
import ConditionTag from "../conditions/ConditionTag.vue";
import ConditionDate from "./edit-decoration/ConditionDate.vue";
import ConditionWeekday from "./edit-decoration/ConditionWeekday.vue";
import ConditionOffset from "./edit-decoration/ConditionOffset.vue";

import { today } from "@/calendar";
import DecorationBorder from "./edit-decoration/DecorationBorder.vue";
import { defaultConditions, defaultDecorations } from "@/defaults";
import ObsidianIconButton from "../obsidian/ObsidianIconButton.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import { deepCopy } from "@/utils/misc";
import { decorationConditionTypeLabels } from "@/components/ui-texts";

const props = defineProps<{
  index: number;
  writeType: JournalSettings["write"]["type"];
  decoration?: JournalDecoration;
}>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "submit", decoration: JournalDecoration): void;
}>();

const day = today().day();

const mode = ref<"and" | "or">(props.decoration?.mode ?? "and");

const conditionTypes = computed(() => {
  const common = ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed"] as const;
  if (props.writeType === "day") {
    return [...common, ...(["date", "weekday"] as const)];
  } else if (props.writeType === "custom") {
    return [...common, ...(["offset"] as const)];
  }
  return common;
});

const conditions = ref<JournalDecorationCondition[]>(props.decoration ? deepCopy(props.decoration.conditions) : []);
const availableConditionTypes = computed(() => {
  const used = new Set(conditions.value.map(({ type }) => type));
  return conditionTypes.value
    .filter((type) => !used.has(type))
    .map((value) => ({ value, label: decorationConditionTypeLabels[value] }));
});
function getConditionComponent(condition: JournalDecorationCondition) {
  switch (condition.type) {
    case "title": {
      return ConditionNoteName;
    }
    case "tag": {
      return ConditionTag;
    }
    case "date": {
      return ConditionDate;
    }
    case "property": {
      return ConditionProperty;
    }
    case "weekday": {
      return ConditionWeekday;
    }
    case "offset": {
      return ConditionOffset;
    }
    case "all-tasks-completed":
    case "has-note":
    case "has-open-task": {
      return ConditionTypeOnly;
    }
  }
}

function addCondition(type: string) {
  conditions.value.push(deepCopy(defaultConditions[type as JournalDecorationCondition["type"]]));
}
function removeDecorationCondition(index: number) {
  conditions.value.splice(index, 1);
}
function chengeDecorationCondition<D extends JournalDecorationCondition, K extends keyof D>(
  condition: D,
  change: { prop: K; value: D[K] },
) {
  condition[change.prop] = change.value;
}

const types = ["background", "color", "shape", "corner", "shape", "icon", "border"] as const;
const decorations = ref<JournalDecorationsStyle[]>(props.decoration ? deepCopy(props.decoration.styles) : []);
const availableTypes = computed(() => {
  const used = new Set(decorations.value.map(({ type }) => type));
  return types.filter((type) => !used.has(type)).map((value) => ({ value, label: value }));
});

function getStyleComponent(decoration: JournalDecorationsStyle) {
  switch (decoration.type) {
    case "background": {
      return DecorationBackground;
    }
    case "color": {
      return DecorationColor;
    }
    case "shape": {
      return DecorationShape;
    }
    case "corner": {
      return DecorationCorner;
    }
    case "icon": {
      return DecorationIcon;
    }
    case "border": {
      return DecorationBorder;
    }
  }
}

function addDecorationStyle(type: string) {
  decorations.value.push(deepCopy(defaultDecorations[type as JournalDecorationsStyle["type"]]));
}
function removeDecorationStyle(index: number) {
  decorations.value.splice(index, 1);
}

function changeDecorationStyle<D extends JournalDecorationsStyle, K extends keyof D>(
  decoration: D,
  change: { prop: K; value: D[K] },
) {
  decoration[change.prop] = change.value;
}

const canSave = computed(() => {
  return decorations.value.length > 0 && conditions.value.length > 0;
});
function save() {
  emit("submit", {
    mode: mode.value,
    conditions: conditions.value,
    styles: decorations.value,
  });
  emit("close");
}
</script>

<template>
  <div>
    <ObsidianSetting>
      Decorate elements in calendar when
      <ObsidianDropdown v-model="mode">
        <option value="and">all conditions are</option>
        <option value="or">any conditions is</option>
      </ObsidianDropdown>
      fullfilled
    </ObsidianSetting>
    <ObsidianSetting>
      <ButtonDropdown :options="availableConditionTypes" @select="addCondition">Add condition</ButtonDropdown>
    </ObsidianSetting>
    <ObsidianSetting v-for="(condition, i) of conditions" :key="i" class="condition-wrapper">
      <span v-if="i > 0" class="mode-hint">{{ mode }}</span>
      <component
        :is="getConditionComponent(condition)"
        :condition="condition"
        @change="chengeDecorationCondition(condition, $event)"
      />
      <ObsidianIconButton icon="trash" @click="removeDecorationCondition(i)" />
    </ObsidianSetting>
    <p v-if="conditions.length === 0" class="journal-hint">No conditions defined yet</p>
    <div class="separator" />
    <div class="preview-container">
      <div class="preview-decoration">
        <CalendarDecoration :styles="decorations">
          {{ day }}
        </CalendarDecoration>
      </div>
      <div>
        <ObsidianSetting>
          <ButtonDropdown :options="availableTypes" @select="addDecorationStyle">Add style</ButtonDropdown>
        </ObsidianSetting>
        <p v-if="decorations.length === 0" class="journal-hint">No styles defined yet</p>
        <div v-for="(decorationView, i) of decorations" :key="i">
          <div v-if="i > 0" class="separator" />
          <ObsidianSetting>
            <template #name>Decorating {{ decorationView.type }}</template>
            <ObsidianIconButton icon="trash" @click="removeDecorationStyle(i)" />
          </ObsidianSetting>
          <component
            :is="getStyleComponent(decorationView)"
            :decoration="decorationView"
            @change="changeDecorationStyle(decorationView, $event)"
          />
        </div>
      </div>
    </div>
    <ObsidianSetting heading>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta :disabled="!canSave" @click="save">Save</ObsidianButton>
    </ObsidianSetting>
  </div>
</template>

<style scoped>
.preview-container {
  display: grid;
  grid-template-columns: 25% 1fr;
}
.preview-decoration {
  position: relative;
  font-size: 48px;
  width: 1.5em;
  height: 1.5em;
  text-align: center;
  margin: 0 auto;
}
.separator {
  width: 100%;
  height: 0;
  border-bottom: 1px solid var(--color-accent);
}
.condition-wrapper {
  position: relative;
}
.mode-hint {
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-s);
  padding: var(--size-2-2);
  position: absolute;
  top: -1em;
  left: 30px;
  text-transform: uppercase;
  font-size: 75%;
}
.separator {
  margin: 0.5em 0;
  border-top: 1px solid var(--color-accent);
  height: 0;
}
.journal-hint {
  text-align: center;
  color: var(--text-faint);
}
</style>
