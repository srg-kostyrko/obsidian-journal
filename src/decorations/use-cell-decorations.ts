import { computed, onMounted, onUnmounted, provide, shallowRef, toRaw, toValue, watchEffect } from "vue";

import type { Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, type VaultPath } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository } from "@/journals";

import { paddingFromAll } from "./derive-styles";
import { cellKey, DecorationEngine, periodKindForWrite, periodMatchesWrite, type DecorationBinding } from "./engine";
import { CellDecorationMapKey, CellPaddingKey, type CellStyleRef } from "./ui/cell-decoration-map-key";

import type { JournalDecoration, JournalDecorationStyle } from "./config";
import type { MaybeRefOrGetter } from "vue";

export function useCellDecorations(
  periodsRef: MaybeRefOrGetter<readonly Period[]>,
  journalNamesRef: MaybeRefOrGetter<readonly string[]>,
): ReadonlyMap<string, CellStyleRef> {
  const engine = useService(DecorationEngine);
  const journals = useService(JournalsRepository);
  const index = useService(JournalsIndex);
  const notes = useService(NotesService);
  const metadata = useService(NoteMetadataService);

  const cells = new Map<string, CellStyleRef>();
  let periodsByKey = new Map<string, Period[]>();
  let keysByPath = new Map<VaultPath, string>();
  let journalNamesInScope = new Set<string>();

  function gatherDecorations(): readonly DecorationBinding[] {
    const out: DecorationBinding[] = [];
    for (const name of toValue(journalNamesRef)) {
      const opt = journals.get(name);
      if (opt.isNone()) continue;
      for (const decoration of opt.value.decorations) {
        out.push({ journalName: name, decoration });
      }
    }
    return out;
  }

  function readPeriods(): Period[] {
    return toValue(periodsRef).map((p) => toRaw(p));
  }

  function rebuildScopeMaps(periods: readonly Period[]): void {
    const journalNames = toValue(journalNamesRef);
    journalNamesInScope = new Set(journalNames);
    keysByPath = new Map<VaultPath, string>();
    for (const period of periods) {
      const anchor = period.anchor.toAnchor();
      for (const name of journalNames) {
        const journalOpt = journals.get(name);
        if (journalOpt.isNone()) continue;
        if (!periodMatchesWrite(period.kind, journalOpt.value.write.type)) continue;
        const opt = index.entryByAnchor(name, anchor);
        if (opt.isSome()) keysByPath.set(opt.value.path, cellKey(period.kind, anchor));
      }
    }
  }

  function reseed(): void {
    const periods = readPeriods();
    rebuildScopeMaps(periods);
    periodsByKey = new Map<string, Period[]>();
    for (const p of periods) {
      const key = cellKey(p.kind, p.anchor.toAnchor());
      const bucket = periodsByKey.get(key);
      if (bucket) bucket.push(p);
      else periodsByKey.set(key, [p]);
    }

    const decorations = gatherDecorations();
    const initial = engine.evaluateRange(periods, decorations);

    for (const key of cells.keys()) {
      if (!periodsByKey.has(key)) cells.delete(key);
    }
    for (const [key] of periodsByKey) {
      const styles: readonly JournalDecorationStyle[] = initial.get(key) ?? [];
      const existing = cells.get(key);
      if (existing) existing.value = styles;
      else cells.set(key, shallowRef<readonly JournalDecorationStyle[]>(styles));
    }

    // Detect mutations of any consumed journal's decorations array. Touching .length
    // and each decoration reference here is enough to register watchEffect dependencies
    // on the underlying reactive proxy.
    for (const name of toValue(journalNamesRef)) {
      const opt = journals.get(name);
      if (opt.isNone()) continue;
      const array = opt.value.decorations as unknown as readonly JournalDecoration[];
      void array.length;
      for (const d of array) void d;
    }
  }

  // Re-evaluate every live cell against the current metadata without rebuilding the
  // scope maps — used when the backing notes are unchanged in scope but their parsed
  // metadata has caught up (e.g. after a rename, see below).
  function recomputeSlots(): void {
    const result = engine.evaluateRange(readPeriods(), gatherDecorations());
    for (const [key, slot] of cells) {
      slot.value = result.get(key) ?? [];
    }
  }

  watchEffect(reseed);
  provide(CellDecorationMapKey, cells);

  // Reading periodsRef re-tracks membership whenever the visible range changes (e.g. month
  // navigation re-keys the whole map), while the per-cell slot reads keep it live as
  // individual decorations come and go.
  const sharedPadding = computed(() => {
    void toValue(periodsRef);
    return paddingFromAll(Array.from(cells.values(), (slot) => slot.value));
  });
  provide(CellPaddingKey, sharedPadding);

  onMounted(() => {
    const offMeta = notes.events.on("metadata-changed", (path) => {
      const key = keysByPath.get(path);
      if (key === undefined) return;
      const periodsAtKey = periodsByKey.get(key);
      const slot = cells.get(key);
      if (!periodsAtKey || !slot) return;
      slot.value = engine.evaluateRange(periodsAtKey, gatherDecorations()).get(key) ?? [];
    });
    const offIndex = index.events.on("entryChanged", ({ entry, kind }) => {
      if (!journalNamesInScope.has(entry.journalName)) return;
      const journalOpt = journals.get(entry.journalName);
      if (journalOpt.isNone()) return;
      const key = cellKey(periodKindForWrite(journalOpt.value.write.type), entry.anchor);
      if (!periodsByKey.has(key)) return;
      if (kind === "added") keysByPath.set(entry.path, key);
      else keysByPath.delete(entry.path);
      const periodsAtKey = periodsByKey.get(key);
      const slot = cells.get(key);
      if (!periodsAtKey || !slot) return;
      slot.value = engine.evaluateRange(periodsAtKey, gatherDecorations()).get(key) ?? [];
    });
    // A rename re-keys the index (entryChanged above) before metadataCache has re-parsed
    // the new path, so the synchronous re-eval reads stale (often empty) metadata and a
    // pure rename fires no metadata-changed to correct it. metadataCache "resolved" is the
    // "cache caught up" signal — recompute the affected cells once it lands.
    let recomputeAfterRename = false;
    const offRename = notes.events.on("renamed", ({ from, to }) => {
      if (keysByPath.has(from) || keysByPath.has(to)) recomputeAfterRename = true;
    });
    const offResolved = metadata.onResolved(() => {
      if (!recomputeAfterRename) return;
      recomputeAfterRename = false;
      recomputeSlots();
    });
    onUnmounted(() => {
      offMeta();
      offIndex();
      offRename();
      offResolved();
    });
  });

  return cells;
}
