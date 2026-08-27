import { toValue, type MaybeRefOrGetter } from "vue";

import type { AnchorString, Period } from "@/calendar";
import { useDecorationMenuItems, type CellStyleRef } from "@/decorations";
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
  isSelectable(): boolean;
}

export type NotesDateSelect = (date: AnchorString) => void;

// MouseEvent and KeyboardEvent come from a different realm in an Obsidian popout. Property
// checks work in every realm; instanceof MouseEvent does not.
function isSelectionGesture(event: MouseEvent | KeyboardEvent): boolean {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  if ("button" in event) return event.button === 0;
  return event.key === "Enter";
}

export function useNotesCell(options: {
  journalNames: MaybeRefOrGetter<readonly string[]>;
  // Passed in rather than injected: the views that call this also call useCellDecorations,
  // and a component's own provide() is invisible to its own inject().
  decorations?: ReadonlyMap<string, CellStyleRef> | null;
  shelf?: MaybeRefOrGetter<string | null>;
  onSelect?: NotesDateSelect;
}): NotesCellApi {
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

  const isSelectable = (): boolean => options.onSelect !== undefined;

  const open = (period: Period, event: MouseEvent | KeyboardEvent): void => {
    if (isSelectionGesture(event)) {
      options.onSelect?.(period.representative.toAnchor());
      return;
    }
    if (!isActionable(period)) return;
    void flows.invoke(OpenDateFlow, {
      anchor: period.anchor.toAnchor(),
      journalNames: [...toValue(options.journalNames)],
      openMode: defineOpenMode(event),
      ...("button" in event && { pickAt: event }),
    });
  };

  const openPreview = (period: Period, event: MouseEvent): void => {
    workspace.previewFirstPath(existingPathsAt(period), event);
  };

  const decorationItems = useDecorationMenuItems(options.decorations ?? null, () => toValue(options.shelf) ?? null);

  const openContextMenu = (period: Period, event: MouseEvent): void => {
    workspace.openPathsMenu(existingPathsAt(period), event, decorationItems({ kind: "fixed", period }));
  };

  return { open, openContextMenu, openPreview, isActive, isActionable, isSelectable };
}
