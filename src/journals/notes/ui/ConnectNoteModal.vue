<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { CalendarDate, type AnchorString } from "@/calendar";
import { DatePicker, useAnchorField, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { JournalsIndex } from "../../journals-index";
import { NoteletPathService } from "../../notelets/notelet-path";
import { pickingForWrite } from "../../picking";
import { promptsInTemplate } from "../../prompts/prompts-in-path";
import { JournalsRepository } from "../../repository";
import { TimelineService } from "../../timeline";
import { isNotelet } from "../../types";
import { useIndexVersion } from "../../use-index-version";
import { NotePathService } from "../note-path";
import { splitVaultPath } from "../vault-path";

import type { ConnectNoteResult } from "./modals";
import type { NoteletType, TypeId } from "../../notelets/config";
import type { NoteletMetadata } from "../../types";

const props = defineProps<{ path: VaultPath }>();
const api = useModal<ConnectNoteResult>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const cycle = useService(CycleService);
const timeline = useService(TimelineService);
const frontmatter = useService(FrontmatterService);
const paths = useService(NotePathService);
const noteletPaths = useService(NoteletPathService);
const indexVersion = useIndexVersion();

const existing = index.entryByPath(props.path);
const existingJournal = existing.isSome() ? existing.value.journalName : "";
const journalNames = [...journals.find().ids()];

const existingEntry = existing.getOrUndefined();
const selected = ref(existingEntry?.journalName ?? journalNames[0] ?? "");
const dateAnchor = ref<AnchorString>((existingEntry?.anchor ?? "") as AnchorString);
const override = ref(false);
const rename = ref(false);
const move = ref(false);
const selectedType = ref<string>(
  existingEntry !== undefined && isNotelet(existingEntry) ? (existingEntry.typeId ?? "") : "",
);

const selectedConfig = computed(() => journals.get(selected.value).getOrUndefined());
const picking = computed<Picking>(() => (selectedConfig.value ? pickingForWrite(selectedConfig.value.write) : "day"));
const bounds = computed(() => timeline.boundsOf(selected.value));
const dateModel = useAnchorField({ anchor: dateAnchor, picking });

const types = computed<readonly [string, NoteletType][]>(() =>
  Object.entries(selectedConfig.value?.notelets ?? {}).toSorted((a, b) => a[1].name.localeCompare(b[1].name)),
);

const activeType = computed(() =>
  selectedType.value ? selectedConfig.value?.notelets[selectedType.value] : undefined,
);

watch([dateAnchor, selected], () => {
  override.value = false;
  rename.value = false;
  move.value = false;
});

// A notelet type belongs to the journal it's configured on, not the date, so only a journal
// change invalidates the current pick; re-dating a connected notelet must keep its type.
watch(selected, () => {
  selectedType.value = "";
});

const anchor = computed(() => {
  if (!selected.value || !dateAnchor.value) return;
  const resolved = cycle.anchorOf(selected.value, CalendarDate.fromAnchor(dateAnchor.value));
  return resolved.isSome() ? resolved.value : undefined;
});

const occupant = computed(() => {
  // Several notelets per anchor is the design, so a notelet type has no occupant to replace.
  if (activeType.value) return;
  const a = anchor.value;
  if (!a) return;
  const found = index.entryByAnchor(selected.value, a);
  if (found.isNone() || found.value.path === props.path) return;
  return found.value.path;
});

const configuredPath = computed(() => {
  const a = anchor.value;
  if (!a || !selectedConfig.value) return;
  const type = activeType.value;
  if (type) {
    // Reading the index inside a computed needs useIndexVersion(): JournalsIndex is not
    // Vue-reactive, and without this the previewed counter would freeze as of mount.
    void indexVersion.value;
    const metadata: NoteletMetadata = {
      kind: "notelet",
      journalName: selected.value,
      anchor: a,
      typeId: selectedType.value as TypeId,
      counter: type.counter.enabled ? noteletPaths.nextIndex(selected.value, a, type.name) : undefined,
    };
    const path = noteletPaths.pathFor(selectedConfig.value, type, metadata);
    return path.isOk() ? path.value : undefined;
  }
  const meta = frontmatter.buildMetadata(selected.value, a);
  if (!meta.isOk()) return;
  const path = paths.pathFor(selected.value, meta.value);
  return path.isOk() ? path.value : undefined;
});

const needRename = computed(() => {
  if (!configuredPath.value) return false;
  return splitVaultPath(props.path)[1] !== splitVaultPath(configuredPath.value)[1];
});

const needMove = computed(() => {
  if (!configuredPath.value) return false;
  return splitVaultPath(props.path)[0] !== splitVaultPath(configuredPath.value)[0];
});

const currentName = computed(() => splitVaultPath(props.path)[1]);
const configuredName = computed(() => (configuredPath.value ? splitVaultPath(configuredPath.value)[1] : ""));
// A root-level note has an empty folder, which reads as a hole in the move description.
function folderLabel(folder: string): string {
  return folder === "" ? m.common_vault_root() : folder;
}
const currentFolder = computed(() => folderLabel(splitVaultPath(props.path)[0]));
const configuredFolder = computed(() =>
  configuredPath.value ? folderLabel(splitVaultPath(configuredPath.value)[0]) : "",
);

const nameBlocked = computed(() => {
  if (activeType.value) return promptsInTemplate(activeType.value.nameTemplate, activeType.value.prompts).length > 0;
  return selectedConfig.value
    ? promptsInTemplate(selectedConfig.value.nameTemplate, selectedConfig.value.prompts).length > 0
    : false;
});
const folderBlocked = computed(() => {
  if (activeType.value) return promptsInTemplate(activeType.value.folder, activeType.value.prompts).length > 0;
  return selectedConfig.value
    ? promptsInTemplate(selectedConfig.value.folder, selectedConfig.value.prompts).length > 0
    : false;
});

const outOfBounds = computed(() => {
  const a = anchor.value;
  if (!a) return false;
  return !timeline.contains(selected.value, a);
});

const canConnect = computed(() => Boolean(anchor.value) && !outOfBounds.value && (!occupant.value || override.value));

function disconnect(): void {
  api.submit({ action: "disconnect", journalName: existingJournal });
}

function connect(): void {
  const a = anchor.value;
  if (!a) return;
  api.submit({
    action: "connect",
    journalName: selected.value,
    anchor: a,
    override: override.value,
    rename: rename.value,
    move: move.value,
    ...(selectedType.value && { typeId: selectedType.value as TypeId }),
  });
}
</script>

<template>
  <!-- Nothing to connect to on a fresh install: the form would render an empty picker above a
       permanently disabled button, which states the situation to nobody. -->
  <div v-if="journalNames.length === 0">
    <UiSettingRow>
      <template #description>{{ m.common_no_journals_yet() }}</template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    </UiSettingRow>
  </div>
  <div v-else>
    <UiSettingRow v-if="existing.isSome()">
      <template #description>
        {{ m.connect_note_modal_connected_to({ journalName: existingJournal }) }}
      </template>
    </UiSettingRow>
    <UiSettingRow v-else>
      <template #description>{{ path }}</template>
    </UiSettingRow>
    <UiSettingRow>
      <template #name>{{ m.common_label_journal() }}</template>
      <UiDropdown v-model="selected" :aria-label="m.common_label_journal()">
        <option v-for="name in journalNames" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-if="types.length > 0">
      <template #name>{{ m.connect_note_modal_kind_label() }}</template>
      <UiDropdown v-model="selectedType" :aria-label="m.connect_note_modal_kind_label()">
        <option value="">{{ m.connect_note_modal_kind_period() }}</option>
        <option v-for="[id, type] in types" :key="id" :value="id">{{ type.name }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow>
      <template #name>{{ m.connect_note_modal_date_label() }}</template>
      <DatePicker v-model="dateModel" :picking="picking" :bounds="bounds" />
    </UiSettingRow>
    <UiSettingRow v-if="outOfBounds">
      <template #description>{{ m.connect_note_modal_out_of_bounds() }}</template>
    </UiSettingRow>
    <UiSettingRow v-if="occupant">
      <template #name>{{ m.connect_note_modal_override_label() }}</template>
      <template #description>{{ m.connect_note_modal_override_description({ path: occupant }) }}</template>
      <UiToggle v-model="override" :tooltip="m.connect_note_modal_override_label()" />
    </UiSettingRow>
    <UiSettingRow v-if="needRename">
      <template #name>{{ m.connect_note_modal_rename_label() }}</template>
      <template #description>
        <span v-if="nameBlocked">{{
          activeType
            ? m.connect_note_modal_rename_refused_prompt_notelet()
            : m.connect_note_modal_rename_refused_prompt()
        }}</span>
        <template v-else>
          {{ m.connect_note_modal_rename_description({ current: currentName, configured: configuredName }) }}
        </template>
      </template>
      <UiToggle v-model="rename" :disabled="nameBlocked" :tooltip="m.connect_note_modal_rename_label()" />
    </UiSettingRow>
    <UiSettingRow v-if="needMove">
      <template #name>{{ m.connect_note_modal_move_label() }}</template>
      <template #description>
        <span v-if="folderBlocked">{{
          activeType ? m.connect_note_modal_move_refused_prompt_notelet() : m.connect_note_modal_move_refused_prompt()
        }}</span>
        <template v-else>
          {{ m.connect_note_modal_move_description({ current: currentFolder, configured: configuredFolder }) }}
        </template>
      </template>
      <UiToggle v-model="move" :disabled="folderBlocked" :tooltip="m.connect_note_modal_move_label()" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton v-if="existing.isSome()" @click="disconnect">{{ m.connect_note_modal_disconnect() }}</UiButton>
      <UiButton cta :disabled="!canConnect" @click="connect">
        {{ existing.isSome() ? m.connect_note_modal_update() : m.connect_note_modal_connect() }}
      </UiButton>
    </UiSettingRow>
  </div>
</template>
