import { computed, type ComputedRef } from "vue";

import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, WorkspaceService } from "@/infrastructure/host";
import type { OpenMode } from "@/infrastructure/host";

import { JournalsRepository } from "../../repository";
import { TimelineService } from "../../timeline";
import { CreateNoteletFlow } from "../flows/create-notelet.flow";

import type { TypeId } from "../config";

export interface NoteletCreationPlacement {
  readonly journalName: string;
  readonly anchor: AnchorString;
}

export interface NoteletCreationTarget extends NoteletCreationPlacement {
  readonly typeId: TypeId;
  readonly typeName: string;
}

export interface NoteletCreationControl {
  readonly targets: ComputedRef<readonly NoteletCreationTarget[]>;
  create(event: MouseEvent): Promise<void>;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function useNoteletCreation(
  placements: () => readonly NoteletCreationPlacement[],
  typeIds?: () => readonly string[] | undefined,
): NoteletCreationControl {
  const journals = useService(JournalsRepository);
  const timeline = useService(TimelineService);
  const workspace = useService(WorkspaceService);
  const flows = useService(Flows);

  const targets = computed<readonly NoteletCreationTarget[]>(() => {
    const filter = typeIds?.();
    const keep = (id: string): boolean => filter === undefined || filter.length === 0 || filter.includes(id);
    return placements()
      .flatMap(({ journalName, anchor }) => {
        if (!timeline.contains(journalName, anchor)) return [];
        const config = journals.get(journalName).getOrUndefined();
        if (config === undefined) return [];
        return Object.entries(config.notelets)
          .filter(([id]) => keep(id))
          .map(([id, type]) => ({ journalName, anchor, typeId: id as TypeId, typeName: type.name }));
      })
      .toSorted((a, b) => {
        const byName = collator.compare(a.typeName, b.typeName);
        return byName === 0 ? collator.compare(a.journalName, b.journalName) : byName;
      });
  });

  function labelsFor(list: readonly NoteletCreationTarget[]): string[] {
    const qualify = new Set(list.map((target) => target.journalName)).size > 1;
    return list.map((target) =>
      qualify
        ? m.journal_notelet_list_type_qualified({ journal: target.journalName, type: target.typeName })
        : target.typeName,
    );
  }

  async function run(target: NoteletCreationTarget, openMode: OpenMode): Promise<void> {
    await flows.invoke(CreateNoteletFlow, {
      journalName: target.journalName,
      typeId: target.typeId,
      anchor: target.anchor,
      openMode,
    });
  }

  async function create(event: MouseEvent): Promise<void> {
    const list = targets.value;
    const only = list.at(0);
    if (only === undefined) return;
    const openMode = defineOpenMode(event);
    if (list.length === 1) {
      await run(only, openMode);
      return;
    }
    const labels = labelsFor(list);
    const chosen = await workspace.pickFromMenu(labels, event);
    if (chosen.isErr()) return;
    const index = labels.indexOf(chosen.value);
    if (index === -1) return;
    const target = list.at(index);
    if (target === undefined) return;
    await run(target, openMode);
  }

  return { targets, create };
}
