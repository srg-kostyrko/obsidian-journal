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
  navBlockRowSchema,
  type JournalConfig,
  type NavBlockRow,
} from "@/journals";
import VariableReferenceHint from "@/journals/settings/ui/VariableReferenceHint.vue";
import { TemplateEngine } from "@/templates";
import UiButton from "@/ui/UiButton.vue";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { buildNavRowContext } from "../../nav-row-context";

import { useShelfMateJournals } from "./use-shelf-mate-journals";

const props = defineProps<{ journalName: string; row?: NavBlockRow }>();
const api = useModal<{ row: NavBlockRow }>();

const journalsVM = useService(JournalsViewModel);
const engine = useService(TemplateEngine);
const cycle = useService(CycleService);
const index = useService(JournalsIndex);

const config = computed<JournalConfig | undefined>(() =>
  journalsVM.getJournal(props.journalName).getOr(undefined as never),
);

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

const shelfMates = useShelfMateJournals(props.journalName);

const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((s) => s.variable) : [],
);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");

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
        <span v-for="error of errorBag.template" :key="error" class="form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="template" :aria-label="m.nav_block_row_field_template()" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_font_size()">
      <UiNumberInput v-model="fontSize" :min="0.5" :step="0.1" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_bold()">
      <UiToggle v-model="bold" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_italic()">
      <UiToggle v-model="italic" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_color()">
      <UiColorSettingsPicker v-model="color" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_background()">
      <UiColorSettingsPicker v-model="background" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_link()">
      <UiDropdown v-model="link" :aria-label="m.nav_block_row_field_link()">
        <option v-for="kind of linkOptions" :key="kind" :value="kind">
          {{ m.nav_block_row_link_option({ kind }) }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow v-if="link === 'journal'" :name="m.nav_block_row_field_journal()">
      <template #description>
        <span v-for="error of errorBag.journal" :key="error" class="form-error">{{ error }}</span>
      </template>
      <UiDropdown v-model="journal" :aria-label="m.nav_block_row_field_journal()">
        <option value="" disabled>—</option>
        <option v-for="name of shelfMates" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_add_decorations()">
      <UiToggle v-model="addDecorations" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.form-error {
  color: var(--text-error);
  display: block;
}
</style>
