<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { computed } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import {
  CycleService,
  JournalsIndex,
  JournalsViewModel,
  NotePathService,
  NumberingService,
  navBlockRowSchema,
  type JournalConfig,
  type NavBlockRow,
} from "@/journals";
import VariableReferenceHint from "@/journals/settings/ui/VariableReferenceHint.vue";
import { templateHasWrongWeek } from "@/journals/settings/ui/wrong-week";
import WrongWeekWarning from "@/journals/settings/ui/WrongWeekWarning.vue";
import { TemplateEngine } from "@/templates";
import UiButton from "@/ui/UiButton.vue";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import { buildNavRowContext } from "../../nav-row-context";

import { useShelfMateJournals } from "./use-shelf-mate-journals";

const props = defineProps<{ journalName: string; row?: NavBlockRow }>();
const api = useModal<{ row: NavBlockRow }>();

const journalsVM = useService(JournalsViewModel);
const engine = useService(TemplateEngine);
const cycle = useService(CycleService);
const numbering = useService(NumberingService);
const notePath = useService(NotePathService);
const index = useService(JournalsIndex);

const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(props.journalName).getOrUndefined());

const initial: NavBlockRow = props.row ?? {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

const schema = v.pipe(
  navBlockRowSchema,
  v.forward(
    v.partialCheck([["template"]], ({ template }) => template.trim().length > 0, m.nav_block_row_template_required()),
    ["template"],
  ),
  v.forward(
    v.partialCheck(
      [["link"], ["journal"]],
      ({ link, journal }) => link !== "journal" || journal.length > 0,
      m.nav_block_row_journal_required(),
    ),
    ["journal"],
  ),
);

const { defineField, errorBag, handleSubmit } = useForm<NavBlockRow>({
  initialValues: JSON.parse(JSON.stringify(initial)) as NavBlockRow,
  validationSchema: toTypedSchema(schema),
});

const [template] = defineField("template");
const [fontSize] = defineField("fontSize");
const [bold] = defineField("bold");
const [italic] = defineField("italic");
const [color] = defineField("color");
const [background] = defineField("background");
const [link] = defineField("link");
const [journal] = defineField("journal");
const [addDecorations] = defineField("addDecorations");

type TextStyle = "bold" | "italic";

const textStyleOptions: { value: TextStyle; label: string; tooltip: string; class: string }[] = [
  { value: "bold", label: "B", tooltip: m.nav_block_row_field_bold(), class: "glyph-bold" },
  { value: "italic", label: "I", tooltip: m.nav_block_row_field_italic(), class: "glyph-italic" },
];

const textStyles = computed<TextStyle[]>({
  get: () => [...(bold.value ? (["bold"] as const) : []), ...(italic.value ? (["italic"] as const) : [])],
  set: (styles) => {
    bold.value = styles.includes("bold");
    italic.value = styles.includes("italic");
  },
});

const shelfMates = useShelfMateJournals(props.journalName);

const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((s) => s.variable) : [],
);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");

const wrongWeek = computed(() => templateHasWrongWeek(template.value ?? ""));

const resolved = computed(() => {
  if (!config.value) return "";
  const today = Clock.now().format("YYYY-MM-DD") as AnchorString;
  return engine.renderString(
    template.value ?? "",
    buildNavRowContext({
      journal: config.value,
      refDate: today,
      entry: index.entryByAnchor(config.value.name, today),
      cycle,
      numbering,
      notePath,
      today,
    }),
  );
});

const linkOptions = ["none", "self", "journal", "day", "week", "month", "quarter", "year"] as const;

const onSubmit = handleSubmit((row) => {
  api.submit({ row });
});
</script>

<template>
  <form v-if="config" novalidate @submit.prevent="onSubmit">
    <UiSettingRow :name="m.nav_block_row_field_template()">
      <template #description>
        <VariableReferenceHint
          context="nav-row"
          :journal-name="journalName"
          :date-format="config.dateFormat"
          :has-cycle="hasCycle"
          :numbering-variable-names="numberingVariableNames"
        />
        <div>{{ m.nav_block_row_resolved_preview({ text: resolved }) }}</div>
        <WrongWeekWarning v-if="wrongWeek" />
        <span v-for="error of errorBag.template" :key="error" class="form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="template" :aria-label="m.nav_block_row_field_template()" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_font_size()">
      <template #description>{{ m.nav_block_row_field_font_size_hint() }}</template>
      <UiNumberInput v-model="fontSize" :min="0.5" :step="0.1" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_text_style()">
      <UiToggleGroup v-model="textStyles" :options="textStyleOptions" />
    </UiSettingRow>

    <UiSettingRow :name="m.common_label_text_color()">
      <UiColorSettingsPicker v-model="color" role="text" />
    </UiSettingRow>

    <UiSettingRow :name="m.common_label_background_color()">
      <UiColorSettingsPicker v-model="background" role="background" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_link()">
      <UiDropdown v-model="link" :aria-label="m.nav_block_row_field_link()">
        <option v-for="kind of linkOptions" :key="kind" :value="kind">
          {{ m.nav_block_row_link_option({ kind }) }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow v-if="link === 'journal'" :name="m.common_label_journal()">
      <template #description>
        <span v-for="error of errorBag.journal" :key="error" class="form-error">{{ error }}</span>
      </template>
      <UiDropdown v-model="journal" :aria-label="m.common_label_journal()">
        <option value="" disabled>—</option>
        <option v-for="name of shelfMates" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_add_decorations()">
      <UiToggle v-model="addDecorations" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">
        {{ row === undefined ? m.common_action_create() : m.common_action_submit() }}
      </UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.form-error {
  color: var(--text-error);
  display: block;
}
:deep(.glyph-bold) {
  font-weight: var(--font-bold);
}
:deep(.glyph-italic) {
  font-style: italic;
}
</style>
