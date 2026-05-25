import { Menu } from "obsidian";
import { toValue, type MaybeRefOrGetter } from "vue";

import type { Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, OpenDateFlow, TimelineService } from "@/journals";

import { ActiveEntryViewModel } from "./active-entry";

export interface NotesCellApi {
  open(period: Period, event: MouseEvent): void;
  openContextMenu(period: Period, event: MouseEvent): void;
  openPreview(period: Period, event: MouseEvent): void;
  isActive(period: Period): boolean;
  isActionable(period: Period): boolean;
}

export function useNotesCell(options: { journalNames: MaybeRefOrGetter<readonly string[]> }): NotesCellApi {
  const flows = useService(Flows);
  const workspace = useService(WorkspaceService);
  const timeline = useService(TimelineService);
  const index = useService(JournalsIndex);
  const activeVM = useService(ActiveEntryViewModel);

  const isActionable = (period: Period): boolean => {
    const names = toValue(options.journalNames);
    const anchor = period.anchor.toAnchor();
    return names.some((name) => timeline.contains(name, anchor));
  };

  const isActive = (period: Period): boolean => {
    const a = activeVM.active.value;
    if (a === null) return false;
    const names = toValue(options.journalNames);
    if (!names.includes(a.journalName)) return false;
    return a.anchor === period.anchor.toAnchor();
  };

  const existingPathsAt = (period: Period): readonly VaultPath[] => {
    const anchor = period.anchor.toAnchor();
    const paths: VaultPath[] = [];
    for (const name of toValue(options.journalNames)) {
      const opt = index.entryByAnchor(name, anchor);
      if (opt.isSome()) paths.push(opt.value.path);
    }
    return paths;
  };

  const open = (period: Period, event: MouseEvent): void => {
    if (!isActionable(period)) return;
    void flows.invoke(OpenDateFlow, {
      anchor: period.anchor.toAnchor(),
      journalNames: [...toValue(options.journalNames)],
      openMode: defineOpenMode(event),
    });
  };

  const openPreview = (period: Period, event: MouseEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    const paths = existingPathsAt(period);
    const [first] = paths;
    if (first === undefined) return;
    workspace.triggerHoverPreview(first, event);
  };

  const openContextMenu = (period: Period, event: MouseEvent): void => {
    const paths = existingPathsAt(period);
    if (paths.length === 0) return;
    const [first] = paths;
    if (first === undefined) return;
    if (paths.length === 1) {
      workspace.openFileMenu(first, event);
      return;
    }
    const menu = new Menu();
    for (const path of paths) {
      menu.addItem((item) => {
        item.setTitle(path).onClick(() => workspace.openFileMenu(path, event));
      });
    }
    menu.showAtMouseEvent(event);
  };

  return { open, openContextMenu, openPreview, isActive, isActionable };
}
