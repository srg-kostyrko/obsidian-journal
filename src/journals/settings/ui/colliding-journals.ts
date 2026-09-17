import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";

import type { JournalConfig } from "../../config";
import type { CycleService } from "../../cycle";
import type { FrontmatterService } from "../../frontmatter";
import type { NotePathService, PathInverter } from "../../notes/note-path";
import type { TimelineService } from "../../timeline";

export interface CollisionServices {
  cycle: CycleService;
  frontmatter: FrontmatterService;
  paths: NotePathService;
  timeline: TimelineService;
}

// Every pair is probed from both sides, so it is the coarser journal's run that has to reach a
// period the two share — a year's first day, a quarter's first month, a week's first day. Any run
// of fourteen fixed periods holds one of each of those.
const SAMPLE_PERIODS = 14;

/**
 * Journals that write a note another journal would also read back as its own, grouped.
 *
 * Asks what auto-attach asks — does a path invert under a second journal, inside that journal's
 * timeline — rather than comparing settings: a template carrying its own date format ignores the
 * journal's default one, and a day and a week journal share a path on the week's first day.
 */
export function findCollidingJournals(
  configs: readonly JournalConfig[],
  { cycle, frontmatter, paths, timeline }: CollisionServices,
): JournalConfig[][] {
  const inverters = new Map<string, PathInverter>();
  for (const config of configs) {
    const inverter = paths.inverterFor(config.name).getOrUndefined();
    if (inverter) inverters.set(config.name, inverter);
  }

  const groupOf = new Map<string, Set<string>>();
  const join = (a: string, b: string): void => {
    const merged = new Set([...(groupOf.get(a) ?? [a]), ...(groupOf.get(b) ?? [b])]);
    for (const member of merged) groupOf.set(member, merged);
  };

  for (const config of configs) {
    const { name } = config;
    let anchor = firstSampleOf(config, cycle);
    for (let steps = 0; anchor !== undefined && steps < SAMPLE_PERIODS; steps++) {
      if (!timeline.contains(name, anchor)) break;
      const path = frontmatter.buildMetadata(name, anchor).flatMap((metadata) => paths.pathFor(name, metadata));
      if (path.isOk()) {
        for (const [other, inverter] of inverters) {
          if (other === name || groupOf.get(name)?.has(other)) continue;
          const candidate = inverter.invert(path.value);
          if (candidate.isSome() && timeline.contains(other, candidate.value.anchor)) join(name, other);
        }
      }
      const next: AnchorString | undefined = cycle.nextAnchor(name, anchor).getOrUndefined();
      anchor = next !== undefined && next > anchor ? next : undefined;
    }
  }

  return [...new Set(groupOf.values())].map((group) => configs.filter((config) => group.has(config.name)));
}

// The run starts at today's period, pulled inside the journal's timeline: a journal that has
// ended or not started yet still wrote, or will write, notes a neighbor could take. An ended
// journal's run ends at its last period instead of starting there.
function firstSampleOf(config: JournalConfig, cycle: CycleService): AnchorString | undefined {
  const today = CalendarDate.today().toAnchor();
  const { start, end } = config.timeline;
  if (start !== "" && start > today) {
    return cycle.anchorOf(config.name, CalendarDate.fromAnchor(start)).getOrUndefined();
  }
  if (end.kind !== "date" || end.date === "" || end.date >= today) {
    return cycle.anchorOf(config.name, CalendarDate.fromAnchor(today)).getOrUndefined();
  }
  let anchor = cycle.anchorOf(config.name, CalendarDate.fromAnchor(end.date)).getOrUndefined();
  for (let steps = 1; anchor !== undefined && steps < SAMPLE_PERIODS; steps++) {
    const previous = cycle.previousAnchor(config.name, anchor).getOrUndefined();
    if (previous === undefined || previous >= anchor) break;
    anchor = previous;
  }
  return anchor;
}
