import { onMounted, onUnmounted, provide, shallowRef, toRaw, toValue, watchEffect } from "vue";

import type { AnchorString, Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository } from "@/journals";

import { DecorationEngine, type DecorationBinding } from "./engine";
import { CellDecorationMapKey, type CellStyleRef } from "./ui/cell-decoration-map-key";

import type { JournalDecoration, JournalDecorationStyle } from "./config";
import type { MaybeRefOrGetter } from "vue";

export function useCellDecorations(
  periodsRef: MaybeRefOrGetter<readonly Period[]>,
  journalNamesRef: MaybeRefOrGetter<readonly string[]>,
): ReadonlyMap<AnchorString, CellStyleRef> {
  const engine = useService(DecorationEngine);
  const journals = useService(JournalsRepository);
  const index = useService(JournalsIndex);
  const notes = useService(NotesService);

  const cells = new Map<AnchorString, CellStyleRef>();
  let periodsByAnchor = new Map<AnchorString, Period>();
  let anchorsByPath = new Map<VaultPath, AnchorString>();
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
    anchorsByPath = new Map<VaultPath, AnchorString>();
    for (const period of periods) {
      const anchor = period.anchor.toAnchor();
      for (const name of journalNames) {
        const opt = index.entryByAnchor(name, anchor);
        if (opt.isSome()) anchorsByPath.set(opt.value.path, anchor);
      }
    }
  }

  function reseed(): void {
    const periods = readPeriods();
    rebuildScopeMaps(periods);
    periodsByAnchor = new Map(periods.map((p) => [p.anchor.toAnchor(), p]));

    const decorations = gatherDecorations();
    const initial = engine.evaluateRange(periods, decorations);

    for (const anchor of cells.keys()) {
      if (!periodsByAnchor.has(anchor)) cells.delete(anchor);
    }
    for (const [anchor] of periodsByAnchor) {
      const styles: readonly JournalDecorationStyle[] = initial.get(anchor) ?? [];
      const existing = cells.get(anchor);
      if (existing) existing.value = styles;
      else cells.set(anchor, shallowRef<readonly JournalDecorationStyle[]>(styles));
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

  watchEffect(reseed);
  provide(CellDecorationMapKey, cells);

  onMounted(() => {
    const offMeta = notes.events.on("metadata-changed", (path) => {
      const anchor = anchorsByPath.get(path);
      if (anchor === undefined) return;
      const period = periodsByAnchor.get(anchor);
      const slot = cells.get(anchor);
      if (!period || !slot) return;
      slot.value = engine.evaluateAnchor(period, gatherDecorations());
    });
    const offIndex = index.events.on("entryChanged", ({ entry, kind }) => {
      if (!journalNamesInScope.has(entry.journalName)) return;
      if (!periodsByAnchor.has(entry.anchor)) return;
      if (kind === "added") anchorsByPath.set(entry.path, entry.anchor);
      else anchorsByPath.delete(entry.path);
      const period = periodsByAnchor.get(entry.anchor);
      const slot = cells.get(entry.anchor);
      if (!period || !slot) return;
      slot.value = engine.evaluateAnchor(period, gatherDecorations());
    });
    onUnmounted(() => {
      offMeta();
      offIndex();
    });
  });

  return cells;
}
