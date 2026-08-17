<script setup lang="ts">
import { onMounted, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { SettingsService } from "@/settings";
import type { SubpageNav } from "@/settings";
import { SnapshotService, type SnapshotInfo } from "@/settings/snapshots/snapshot-service";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { nav } = defineProps<{ nav: SubpageNav }>();

const snapshots = useService(SnapshotService);
const settings = useService(SettingsService);
const notices = useService(NoticeService);

const available = ref<SnapshotInfo[]>([]);
const listFailed = ref(false);

async function refresh(): Promise<void> {
  const listed = await snapshots.list();
  listFailed.value = listed.isErr();
  available.value = listed.match({ ok: (value) => value, err: () => [] });
}

async function restore(info: SnapshotInfo): Promise<void> {
  const contents = await snapshots.read(info.name);
  if (contents.isErr()) {
    notices.show(m.maintenance_snapshot_failed());
    return;
  }
  const replaced = await settings.replaceStoredData(contents.value);
  notices.show(
    replaced.isErr() ? m.maintenance_snapshot_failed() : m.maintenance_snapshot_restored({ takenAt: info.takenAt }),
  );
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <div>
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading :name="m.maintenance_snapshots_heading()" />
    <UiSettingRow v-if="listFailed">
      <template #description>{{ m.maintenance_snapshots_load_failed() }}</template>
    </UiSettingRow>
    <UiSettingRow v-else-if="available.length === 0">
      <template #description>{{ m.maintenance_snapshots_empty() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="info of available" :key="info.name" :name="info.takenAt">
      <template #description>{{ m.maintenance_snapshot_row({ version: info.fromVersion }) }}</template>
      <UiButton @click="restore(info)">{{ m.maintenance_snapshot_restore() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
