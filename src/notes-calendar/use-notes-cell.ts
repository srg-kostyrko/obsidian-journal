import { toValue, type MaybeRefOrGetter } from "vue";

import type { Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, OpenDateFlow, TimelineService } from "@/journals";

import { ActiveEntryViewModel } from "./active-entry";

export interface NotesCellApi {
  open(period: Period, event: MouseEvent | KeyboardEvent): void;
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

  const existingPathsAt = (period: Period): readonly VaultPath[] =>
    index.pathsAt(toValue(options.journalNames), period.anchor.toAnchor());

  const open = (period: Period, event: MouseEvent | KeyboardEvent): void => {
    if (!isActionable(period)) return;
    void flows.invoke(OpenDateFlow, {
      anchor: period.anchor.toAnchor(),
      journalNames: [...toValue(options.journalNames)],
      openMode: defineOpenMode(event),
    });
  };

  const openPreview = (period: Period, event: MouseEvent): void => {
    workspace.previewFirstPath(existingPathsAt(period), event);
  };

  const openContextMenu = (period: Period, event: MouseEvent): void => {
    workspace.openPathsMenu(existingPathsAt(period), event);
  };

  return { open, openContextMenu, openPreview, isActive, isActionable };
}
