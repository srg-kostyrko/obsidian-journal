<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { CalendarDate } from "@/calendar";
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
import { JournalsRepository } from "../../repository";
import { TimelineService } from "../../timeline";
import { NotePathService } from "../note-path";
import { splitVaultPath } from "../vault-path";

import type { ConnectNoteResult } from "./modals";

const props = defineProps<{ path: VaultPath }>();
const api = useModal<ConnectNoteResult>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const cycle = useService(CycleService);
const timeline = useService(TimelineService);
const frontmatter = useService(FrontmatterService);
const paths = useService(NotePathService);

const existing = index.entryByPath(props.path);
const existingJournal = existing.isSome() ? existing.value.journalName : "";
const journalNames = [...journals.find().ids()];

const selected = ref(journalNames[0] ?? "");
const dateString = ref(CalendarDate.today().toAnchor());
const override = ref(false);
const rename = ref(false);
const move = ref(false);

watch([dateString, selected], () => {
  override.value = false;
  rename.value = false;
  move.value = false;
});

const anchor = computed(() => {
  if (!selected.value) return;
  const parsed = CalendarDate.parse(dateString.value);
  if (!parsed.isOk()) return;
  const resolved = cycle.anchorOf(selected.value, parsed.value);
  return resolved.isSome() ? resolved.value : undefined;
});

const occupant = computed(() => {
  const a = anchor.value;
  if (!a) return;
  const found = index.entryByAnchor(selected.value, a);
  if (found.isNone() || found.value.path === props.path) return;
  return found.value.path;
});

const configuredPath = computed(() => {
  const a = anchor.value;
  if (!a) return;
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
const currentFolder = computed(() => splitVaultPath(props.path)[0]);
const configuredFolder = computed(() => (configuredPath.value ? splitVaultPath(configuredPath.value)[0] : ""));

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
  });
}
</script>

<template>
  <div v-if="existing.isSome()">
    <UiSettingRow>
      <template #description>
        {{ m.connect_note_modal_connected_to({ journalName: existingJournal }) }}
      </template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="disconnect">{{ m.connect_note_modal_disconnect() }}</UiButton>
    </UiSettingRow>
  </div>
  <div v-else>
    <UiSettingRow>
      <template #name>{{ m.common_label_journal() }}</template>
      <UiDropdown v-model="selected">
        <option v-for="name in journalNames" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow>
      <template #name>{{ m.connect_note_modal_date_label() }}</template>
      <input v-model="dateString" type="date" :aria-label="m.connect_note_modal_date_label()" />
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
        {{ m.connect_note_modal_rename_description({ current: currentName, configured: configuredName }) }}
      </template>
      <UiToggle v-model="rename" :tooltip="m.connect_note_modal_rename_label()" />
    </UiSettingRow>
    <UiSettingRow v-if="needMove">
      <template #name>{{ m.connect_note_modal_move_label() }}</template>
      <template #description>
        {{ m.connect_note_modal_move_description({ current: currentFolder, configured: configuredFolder }) }}
      </template>
      <UiToggle v-model="move" :tooltip="m.connect_note_modal_move_label()" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta :disabled="!canConnect" @click="connect">{{ m.connect_note_modal_connect() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
