import { computed, type ComputedRef, type Ref } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { NotePathService } from "../../notes/note-path";
import { TimelineService } from "../../timeline";

import { findPathCollision, type PathCollision } from "./name-template-collision";

import type { JournalConfig } from "../../config";

const SAMPLE_COUNT = 40;

export function useCollisionCheck(config: Ref<JournalConfig | undefined>): ComputedRef<PathCollision | null> {
  const cycle = useService(CycleService);
  const timeline = useService(TimelineService);
  const frontmatter = useService(FrontmatterService);
  const notePath = useService(NotePathService);
  return computed(() => {
    const value = config.value;
    if (!value?.nameTemplate) return null;
    const name = value.name;
    // Walking from the timeline start rather than today keeps the verdict stable from
    // one day to the next; an unset start leaves today as the only origin available.
    const origin = value.timeline.start === "" ? CalendarDate.today() : CalendarDate.fromAnchor(value.timeline.start);
    const startAnchor = cycle.anchorOf(name, origin);
    if (startAnchor.isNone()) return null;
    const anchors: AnchorString[] = [];
    let current = startAnchor.value;
    // CycleService steps forever, so the timeline is what stops the walk: periods past the
    // journal's end never become notes and must not raise a collision.
    while (anchors.length < SAMPLE_COUNT && timeline.contains(name, current)) {
      anchors.push(current);
      const next = cycle.nextAnchor(name, current);
      // A custom cycle's next anchor is derived from a stored end date; a hand-edited
      // end date at or before its own anchor would make the walk go backwards or stall.
      if (next.isNone() || next.value <= current) break;
      current = next.value;
    }
    return findPathCollision(anchors, (candidate) => {
      // candidate is already a canonical anchor, so build metadata straight from it
      // rather than round-tripping through pathForDate, which re-derives the anchor
      // from a date and walks a custom cycle's stored entries all over again.
      const path = frontmatter.buildMetadata(name, candidate).flatMap((metadata) => notePath.pathFor(name, metadata));
      return path.isOk() ? path.value : undefined;
    });
  });
}
